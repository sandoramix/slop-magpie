// Accounts: one per person, each with its own library. The admin (API_TOKEN) is a row too.
//
// Credentials: an account starts with a generated token, which is a temporary credential. Once the
// person sets a password the token stops working and each device signs in with username +
// password (a session token). "Forgot password" = the admin resets the account: new token, no
// password, no sessions.
import { randomBytes } from "node:crypto";
import { ADMIN_USER_ID, auditLog, type Database, deletedTokens, items, sessions, users } from "@magpie/db";
import type { CreateUserResponse, MeResponse, Role, UpdateMeBody, User } from "@magpie/shared/api";
import { and, count, eq, gt, isNotNull, isNull, lt } from "drizzle-orm";
import type { AccountLookup, AuditEvent, Authenticated, Principal, ServiceDeps } from "../deps.ts";
import { ApiError } from "../http/errors.ts";
import { hashToken } from "../middleware/auth.ts";
import { hashPassword, newSessionToken, revokeSessions, SESSION_TTL_DAYS, touchSession } from "./credentials.ts";
import { deleteItems } from "./items.ts";
import { isUniqueViolation } from "./pg-errors.ts";
import { usedBytesSql, usersIdSql } from "./storage.ts";

const accountColumns = {
  id: users.id,
  name: users.name,
  displayName: users.displayName,
  isAdmin: users.isAdmin,
  hasPassword: isNotNull(users.passwordHash).mapWith(Boolean),
};

export function createAccountLookup(db: Database): AccountLookup {
  return {
    async findByTokenHash(tokenHash): Promise<Authenticated | null> {
      // the generated token (temporary: gone once a password is set)
      const [direct] = await db.select(accountColumns).from(users).where(and(eq(users.tokenHash, tokenHash), isNull(users.suspendedAt)));
      if (direct) return direct;

      const [session] = await db
        .select({ ...accountColumns, sessionId: sessions.id })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date()), isNull(users.suspendedAt)));
      if (!session) return null;
      await touchSession(db, session.sessionId);
      return session;
    },
    async findById(id): Promise<Authenticated | null> {
      const [row] = await db.select(accountColumns).from(users).where(and(eq(users.id, id), isNull(users.suspendedAt)));
      return row ?? null;
    },
    async isDeletedToken(tokenHash): Promise<boolean> {
      const [row] = await db.select({ h: deletedTokens.tokenHash }).from(deletedTokens).where(eq(deletedTokens.tokenHash, tokenHash));
      return row !== undefined;
    },
  };
}

// long enough for a phone that was off for months to hear about it, short enough not to pile up
const TOMBSTONE_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/** `mgp_` + 256 random bits. Only the hash is stored. */
export const newToken = (): string => `mgp_${randomBytes(32).toString("base64url")}`;

const conflict = (error: unknown): never => {
  if (isUniqueViolation(error)) throw new ApiError(409, "conflict", "An account with this name already exists");
  throw error;
};

const toUser = (row: {
  id: string;
  name: string;
  displayName: string | null;
  isAdmin: boolean;
  hasPassword: boolean;
  createdAt: Date;
  itemCount: number;
  storageLimitBytes: number | null;
  storageUsedBytes: number;
}): User => ({
  id: row.id,
  name: row.name,
  displayName: row.displayName,
  isAdmin: row.isAdmin,
  hasPassword: row.hasPassword,
  isRoot: row.id === ADMIN_USER_ID,
  createdAt: row.createdAt.toISOString(),
  itemCount: row.itemCount,
  storage: { usedBytes: row.storageUsedBytes, limitBytes: row.storageLimitBytes },
});

const userColumns = {
  id: users.id,
  name: users.name,
  displayName: users.displayName,
  isAdmin: users.isAdmin,
  hasPassword: isNotNull(users.passwordHash).mapWith(Boolean),
  createdAt: users.createdAt,
  itemCount: count(items.id),
  storageLimitBytes: users.storageLimitBytes,
  storageUsedBytes: usedBytesSql(usersIdSql),
};

export async function getUser(db: Database, id: string): Promise<User> {
  const [row] = await db
    .select(userColumns)
    .from(users)
    .leftJoin(items, eq(items.userId, users.id))
    .where(eq(users.id, id))
    .groupBy(users.id);
  if (!row) throw new ApiError(404, "not_found", "Account not found");
  return toUser(row);
}

export async function listUsers(db: Database): Promise<User[]> {
  const rows = await db.select(userColumns).from(users).leftJoin(items, eq(items.userId, users.id)).groupBy(users.id).orderBy(users.createdAt);
  return rows.map(toUser);
}

export async function createUser(db: Database, name: string, role: Role): Promise<CreateUserResponse> {
  const token = newToken();
  const [row] = await db
    .insert(users)
    .values({ name, isAdmin: role === "admin", tokenHash: hashToken(token) })
    .returning({ id: users.id })
    .catch(conflict);
  if (!row) throw new Error("insert returned no row");
  return { user: await getUser(db, row.id), token };
}

/** The username is fixed; people change only how their name is shown. */
export async function updateDisplayName(db: Database, id: string, body: UpdateMeBody): Promise<User> {
  const rows = await db.update(users).set({ displayName: body.displayName }).where(eq(users.id, id)).returning({ id: users.id });
  if (rows.length === 0) throw new ApiError(404, "not_found", "Account not found");
  return getUser(db, id);
}

/** Promote or demote. The root admin (API_TOKEN) is always an admin, and nobody changes their own role. */
export async function setRole(db: Database, id: string, role: Role, actorId: string): Promise<User> {
  if (id === ADMIN_USER_ID) throw new ApiError(400, "bad_request", "The root admin is always an admin");
  if (id === actorId) throw new ApiError(400, "bad_request", "You cannot change your own role");
  const rows = await db.update(users).set({ isAdmin: role === "admin" }).where(eq(users.id, id)).returning({ id: users.id });
  if (rows.length === 0) throw new ApiError(404, "not_found", "Account not found");
  // a demoted account must not keep acting as an admin through a session opened earlier: roles are read per request, so nothing to revoke
  return getUser(db, id);
}

/** Cap on an account's stored media, in bytes; null removes the cap. Applies to the root admin too. */
export async function setStorageLimit(db: Database, id: string, limitBytes: number | null): Promise<User> {
  const rows = await db.update(users).set({ storageLimitBytes: limitBytes }).where(eq(users.id, id)).returning({ id: users.id });
  if (rows.length === 0) throw new ApiError(404, "not_found", "Account not found");
  return getUser(db, id);
}

/**
 * Password recovery, done by the admin: a fresh temporary token, no password, every device signed
 * out. The person signs in with the token and sets a new password.
 */
export async function resetCredentials(db: Database, id: string): Promise<{ token: string }> {
  if (id === ADMIN_USER_ID) throw new ApiError(400, "bad_request", "The admin token is set with API_TOKEN");
  const token = newToken();
  const found = await db.transaction(async (tx) => {
    const rows = await tx
      .update(users)
      .set({ tokenHash: hashToken(token), passwordHash: null })
      .where(eq(users.id, id))
      .returning({ id: users.id });
    if (rows.length === 0) return false;
    await revokeSessions(tx, id);
    return true;
  });
  if (!found) throw new ApiError(404, "not_found", "Account not found");
  return { token };
}

/**
 * The person picks a password. The temporary token stops working, other devices are signed out,
 * and this device gets a session token to use from now on. The admin keeps API_TOKEN (set in the
 * environment) as its recovery credential, so it is never locked out.
 */
export async function setPassword(db: Database, id: string, password: string, label: string | null): Promise<string | null> {
  const passwordHash = await hashPassword(password);
  // the root admin keeps API_TOKEN as well: no session is needed and nothing is retired
  const root = id === ADMIN_USER_ID;
  const token = newSessionToken();
  await db.transaction(async (tx) => {
    const rows = await tx
      .update(users)
      .set(root ? { passwordHash } : { passwordHash, tokenHash: null })
      .where(eq(users.id, id))
      .returning({ id: users.id });
    if (rows.length === 0) throw new ApiError(404, "not_found", "Account not found");
    await revokeSessions(tx, id);
    if (root) return;
    await tx.insert(sessions).values({
      userId: id,
      tokenHash: hashToken(token),
      label,
      expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
    });
  });
  return root ? null : token;
}

/** Removes the account, its library and its files. */
export async function deleteUser(
  deps: Omit<ServiceDeps, "userId">,
  id: string,
  actorId: string,
  audit: Omit<AuditEvent, "action" | "details">,
): Promise<void> {
  if (id === ADMIN_USER_ID) throw new ApiError(400, "bad_request", "The root admin account cannot be deleted");
  if (id === actorId) throw new ApiError(400, "bad_request", "You cannot delete your own account");
  const target = await getUser(deps.db, id);
  // items go through the normal path so their blobs are queued for deletion
  const owned = await deps.db.select({ id: items.id }).from(items).where(eq(items.userId, id));
  if (owned.length) {
    await deleteItems(
      { ...deps, userId: id },
      owned.map((r) => r.id),
      audit,
      "user.delete_items",
    );
  }
  // remember the account's token hashes so its devices learn what happened (see deletedTokens)
  const sessionRows = await deps.db.select({ h: sessions.tokenHash }).from(sessions).where(eq(sessions.userId, id));
  const [own] = await deps.db.select({ h: users.tokenHash }).from(users).where(eq(users.id, id));
  const hashes = [...sessionRows.map((r) => r.h), ...(own?.h ? [own.h] : [])];
  if (hashes.length) {
    await deps.db.insert(deletedTokens).values(hashes.map((tokenHash) => ({ tokenHash, userName: target.name }))).onConflictDoNothing();
  }
  await deps.db.delete(deletedTokens).where(lt(deletedTokens.deletedAt, new Date(Date.now() - TOMBSTONE_TTL_MS)));
  await deps.db.delete(users).where(eq(users.id, id));
  await deps.db.insert(auditLog).values({ ...audit, action: "user.delete", details: { id, name: target.name, items: owned.length } });
}

export function whoAmI(principal: Pick<Principal, "id" | "name" | "displayName" | "isAdmin" | "hasPassword" | "actingAs">): MeResponse {
  return {
    id: principal.id,
    name: principal.name,
    displayName: principal.displayName,
    isAdmin: principal.isAdmin,
    hasPassword: principal.hasPassword,
    actingAs: principal.actingAs,
  };
}
