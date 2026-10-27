// Self-service signup. `invite` mode needs a single-use code issued by an admin; `open` mode does not
// (REGISTRATION_MODE, default invite). Passwords are chosen at signup, so no temporary token exists.
import { randomBytes } from "node:crypto";
import { type Database, invites, sessions, users } from "@magpie/db";
import type { InviteResponse, RegistrationMode, SignupBody } from "@magpie/shared/api";
import { and, eq, gt, isNull } from "drizzle-orm";
import { ApiError } from "../http/errors.ts";
import { hashToken } from "../middleware/auth.ts";
import { hashPassword, newSessionToken, SESSION_TTL_DAYS } from "./credentials.ts";
import { isUniqueViolation } from "./pg-errors.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const INVITE_TTL_DAYS = 14;

export async function createInvite(db: Database, createdBy: string): Promise<InviteResponse> {
  const code = `mgi_${randomBytes(12).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * DAY_MS);
  await db.insert(invites).values({ codeHash: hashToken(code), createdBy, expiresAt });
  return { code, expiresAt: expiresAt.toISOString() };
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Marks an invite as used; throws 403 when it is unknown, used or expired. Returns its id. */
export async function claimInvite(tx: Tx, code: string): Promise<string> {
  const [claimed] = await tx
    .update(invites)
    .set({ usedAt: new Date() })
    .where(and(eq(invites.codeHash, hashToken(code)), isNull(invites.usedAt), gt(invites.expiresAt, new Date())))
    .returning({ id: invites.id });
  if (!claimed) throw new ApiError(403, "forbidden", "That invite code is invalid, used or expired");
  return claimed.id;
}

export async function markInviteUsedBy(tx: Tx, inviteId: string, userId: string): Promise<void> {
  await tx.update(invites).set({ usedBy: userId }).where(eq(invites.id, inviteId));
}

export async function signup(
  db: Database,
  mode: RegistrationMode,
  body: SignupBody,
  label: string | null,
): Promise<{ token: string; userId: string }> {
  if (mode === "invite" && !body.inviteCode) throw new ApiError(403, "forbidden", "Signup needs an invite code");
  const passwordHash = await hashPassword(body.password);
  const token = newSessionToken();

  return db
    .transaction(async (tx) => {
      const inviteId = mode === "invite" && body.inviteCode ? await claimInvite(tx, body.inviteCode) : null;
      const [user] = await tx.insert(users).values({ name: body.username, passwordHash }).returning({ id: users.id });
      if (!user) throw new Error("insert returned no row");
      if (inviteId) await markInviteUsedBy(tx, inviteId, user.id);
      await tx.insert(sessions).values({
        userId: user.id,
        tokenHash: hashToken(token),
        label,
        expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * DAY_MS),
      });
      return { token, userId: user.id };
    })
    .catch((error: unknown) => {
      // the transaction rolled back, so the invite is still usable
      if (isUniqueViolation(error)) throw new ApiError(409, "conflict", "That username is taken");
      throw error;
    });
}
