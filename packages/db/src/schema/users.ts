import { sql } from "drizzle-orm";
import { DEFAULT_STORAGE_LIMIT_BYTES, ROOT_ADMIN_ID } from "@magpie/shared/api";
import { bigint, boolean, index, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, timestamptz } from "./columns.ts";

/** The admin account owns the library that existed before accounts did; it signs in with API_TOKEN. */
export const ADMIN_USER_ID = ROOT_ADMIN_ID;

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
    // cap on the bytes of original media the account may store; null = unlimited. Set by the admin.
    storageLimitBytes: bigint({ mode: "number" }).default(DEFAULT_STORAGE_LIMIT_BYTES),
    // shown on the public profile
    bio: text(),
    // a suspended account cannot sign in or be seen (moderation)
    suspendedAt: timestamptz(),
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
 * A login method linked to an account: Google, GitHub or Discord (docs/security.md#social-login).
 * The provider's own user id is the key, never the email, which can change or be unverified.
 * An account may have several, and a password too; an account made through a provider has no password.
 */
export const authIdentities = pgTable(
  "auth_identities",
  {
    id: id(),
    userId: ownerId(),
    // validated against `OAuthProvider` in packages/shared; text so a new provider needs no migration
    provider: text().notNull(),
    providerUserId: text().notNull(),
    // as reported by the provider at the last login; informational, may be null or unverified
    email: text(),
    createdAt: createdAt(),
    lastLoginAt: timestamptz(),
  },
  (t) => [uniqueIndex("auth_identities_provider_key").on(t.provider, t.providerUserId), index("auth_identities_user_idx").on(t.userId)],
);

/**
 * Short-lived, single-use records of a social login in progress. `state` rows bind the browser round trip
 * to the app that started it (and hold the PKCE verifier); `ticket` rows carry the verified provider
 * identity from the callback back to the app, which swaps it for a session. Only hashes are stored.
 */
export const oauthTransactions = pgTable(
  "oauth_transactions",
  {
    id: id(),
    kind: text().notNull(),
    tokenHash: text().notNull(),
    provider: text().notNull(),
    // validated with zod when read (see services/oauth.ts)
    payload: jsonb().$type<unknown>().notNull().default({}),
    expiresAt: timestamptz().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("oauth_transactions_hash_key").on(t.kind, t.tokenHash), index("oauth_transactions_expires_idx").on(t.expiresAt)],
);

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
