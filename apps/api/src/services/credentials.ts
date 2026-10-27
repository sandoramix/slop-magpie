// Optional passwords and per-device sessions. The generated account token always works as a direct
// login; a password only adds username + password login, which hands out a session token.
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { type Database, sessions, users } from "@magpie/db";
import { and, eq, sql } from "drizzle-orm";
import { hashToken } from "../middleware/auth.ts";

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number }) => Promise<Buffer>;

const SCRYPT = { N: 16384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
export const SESSION_TTL_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

/** `scrypt$N$r$p$salt$hash` (base64). The parameters travel with the hash so they can change later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LENGTH, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, n, r, p, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await scryptAsync(password, Buffer.from(salt, "base64"), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// verified against when the username does not exist, so a miss costs the same as a wrong password
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword(randomBytes(16).toString("hex")));

/** `mgs_` + 256 random bits. Only the hash is stored. */
export const newSessionToken = (): string => `mgs_${randomBytes(32).toString("base64url")}`;

/** Username + password → a new session for this device, or null when they do not match. */
export async function login(
  db: Database,
  username: string,
  password: string,
  label: string | null,
): Promise<{ token: string; userId: string } | null> {
  const [row] = await db
    .select({ id: users.id, passwordHash: users.passwordHash, suspendedAt: users.suspendedAt })
    .from(users)
    .where(sql`lower(${users.name}) = ${username.toLowerCase()}`);
  const ok = await verifyPassword(password, row?.passwordHash ?? (await getDummyHash()));
  if (!row?.passwordHash || !ok || row.suspendedAt) return null;

  const token = newSessionToken();
  await db.insert(sessions).values({
    userId: row.id,
    tokenHash: hashToken(token),
    label,
    expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * DAY_MS),
  });
  return { token, userId: row.id };
}

/** Signs out the device that presented this session token. */
export async function revokeSession(db: Database, tokenHash: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

/** Signs out every device except, optionally, the one presenting `exceptTokenHash`. */
export async function revokeSessions(db: Pick<Database, "delete">, userId: string, exceptTokenHash?: string): Promise<number> {
  const rows = await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), exceptTokenHash ? sql`${sessions.tokenHash} <> ${exceptTokenHash}` : undefined))
    .returning({ id: sessions.id });
  return rows.length;
}

/** Sliding expiry: a device in regular use never has to sign in again. Written at most once a day. */
export async function touchSession(db: Database, sessionId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ lastUsedAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * DAY_MS) })
    .where(and(eq(sessions.id, sessionId), sql`${sessions.lastUsedAt} < now() - interval '1 day'`));
}
