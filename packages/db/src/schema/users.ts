import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, timestamptz } from "./columns.ts";

/** The admin account owns the library that existed before accounts did; it signs in with API_TOKEN. */
export const ADMIN_USER_ID = "00000000-0000-7000-8000-000000000001";

export const users = pgTable(
  "users",
  {
    id: id(),
    // the username: chosen by the admin, never changes
    name: text().notNull(),
    // what the person likes to be called; shown instead of the username when set
    displayName: text(),
    isAdmin: boolean().notNull().default(false),
    // sha256 of the account token (hex). Null for the admin, which uses the API_TOKEN env var.
    tokenHash: text(),
    // optional: set by the person after their first login with the generated token (scrypt, see services/credentials.ts)
    passwordHash: text(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("users_name_key").on(sql`lower(${t.name})`),
    uniqueIndex("users_token_hash_key").on(t.tokenHash).where(sql`${t.tokenHash} is not null`),
  ],
);

/** Owner column for every top-level table; deleting an account removes its rows. */
export const ownerId = () =>
  uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

/**
 * Hashes of the tokens a deleted account had (its generated token and its sessions), kept so a
 * phone that still holds one can be told "this account was deleted" instead of "bad token".
 * Holds no library data; old rows are purged.
 */
export const deletedTokens = pgTable("deleted_tokens", {
  tokenHash: text().primaryKey(),
  userName: text().notNull(),
  deletedAt: timestamptz().notNull().defaultNow(),
});

/**
 * A persistent login for one device, created by signing in with username + password. Only the
 * hash of its token is stored; it can be revoked on its own or all at once.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: ownerId(),
    tokenHash: text().notNull(),
    label: text(),
    createdAt: createdAt(),
    lastUsedAt: timestamptz().notNull().defaultNow(),
    expiresAt: timestamptz().notNull(),
  },
  (t) => [uniqueIndex("sessions_token_hash_key").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);
