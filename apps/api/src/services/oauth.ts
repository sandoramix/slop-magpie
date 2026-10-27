// Social login: authorization code + PKCE, with the code exchanged on the server so client secrets never
// reach the app. The round trip is
//   app --start--> API (state saved) --> provider --callback--> API (identity verified, ticket saved)
//   --magpie://oauth?ticket=...--> app --exchange--> API (session)
// Linking an identity to a signed-in account is the same trip with `mode: "link"`.
import { createHash, randomBytes } from "node:crypto";
import { authIdentities, type Database, oauthTransactions, sessions, users } from "@magpie/db";
import { type MeResponse, OAUTH_APP_REDIRECT, type OAuthExchangeBody, type OAuthExchangeResponse, type OAuthProvider, type RegistrationMode } from "@magpie/shared/api";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "../http/errors.ts";
import { hashToken } from "../middleware/auth.ts";
import { providers, type ProviderCredentials, type ProviderProfile, suggestUsername } from "../oauth/providers.ts";
import { newSessionToken, SESSION_TTL_DAYS } from "./credentials.ts";
import { isUniqueViolation } from "./pg-errors.ts";
import { claimInvite, markInviteUsedBy } from "./signup.ts";

const MINUTE_MS = 60_000;
const STATE_TTL_MS = 10 * MINUTE_MS;
const TICKET_TTL_MS = 3 * MINUTE_MS;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface OAuthConfig {
  /** Public base URL of this API, e.g. https://magpie.example.com; the redirect URI is built from it. */
  publicBaseUrl: string;
  credentials: Partial<Record<OAuthProvider, ProviderCredentials>>;
  /** Replaced in tests. */
  fetch?: typeof fetch;
}

/** Providers with both a client id and a secret; the only ones the app may offer. */
export const configuredProviders = (config: Pick<OAuthConfig, "credentials">): OAuthProvider[] =>
  (Object.keys(providers) as OAuthProvider[]).filter((p) => {
    const c = config.credentials[p];
    return c !== undefined && c.clientId !== "" && c.clientSecret !== "";
  });

export const redirectUri = (config: OAuthConfig, provider: OAuthProvider): string => `${config.publicBaseUrl}/api/v1/auth/oauth/${provider}/callback`;

const random = (bytes = 32): string => randomBytes(bytes).toString("base64url");
const sha256Base64Url = (value: string): string => createHash("sha256").update(value).digest("base64url");

function credentialsOf(config: OAuthConfig, provider: OAuthProvider): ProviderCredentials {
  const c = config.credentials[provider];
  if (!c?.clientId || !c.clientSecret) throw new ApiError(404, "not_found", "That login method is not available on this server");
  return c;
}

const StatePayload = z.object({
  mode: z.enum(["login", "link"]),
  verifier: z.string(),
  // who is linking
  userId: z.uuid().optional(),
});

const TicketPayload = z.union([
  z.object({ kind: z.literal("known"), userId: z.uuid(), identityId: z.uuid() }),
  z.object({
    kind: z.literal("new"),
    providerUserId: z.string(),
    email: z.string().nullable(),
    suggestedUsername: z.string(),
  }),
]);

async function save(db: Database, kind: "state" | "ticket", token: string, provider: OAuthProvider, payload: unknown, ttlMs: number) {
  await db.insert(oauthTransactions).values({ kind, tokenHash: hashToken(token), provider, payload, expiresAt: new Date(Date.now() + ttlMs) });
  // housekeeping: expired rows are useless
  await db.delete(oauthTransactions).where(lt(oauthTransactions.expiresAt, new Date()));
}

/** Reads and removes a record in one step, so a state or ticket can be used only once. */
async function take(db: Database, kind: "state" | "ticket", token: string, provider?: OAuthProvider) {
  const [row] = await db
    .delete(oauthTransactions)
    .where(and(eq(oauthTransactions.kind, kind), eq(oauthTransactions.tokenHash, hashToken(token)), gt(oauthTransactions.expiresAt, new Date())))
    .returning();
  if (!row || (provider && row.provider !== provider)) return null;
  return row;
}

/** The URL to open in the system browser. */
export async function start(db: Database, config: OAuthConfig, provider: OAuthProvider, mode: "login" | "link", userId?: string): Promise<string> {
  const { clientId } = credentialsOf(config, provider);
  const def = providers[provider];
  const state = random();
  const verifier = random(48);
  await save(db, "state", state, provider, { mode, verifier, ...(userId ? { userId } : {}) } satisfies z.infer<typeof StatePayload>, STATE_TTL_MS);

  const url = new URL(def.authorizeUrl);
  const params: Record<string, string> = {
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri(config, provider),
    scope: def.scope,
    state,
    code_challenge: sha256Base64Url(verifier),
    code_challenge_method: "S256",
    ...def.authorizeParams,
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.href;
}

const Token = z.looseObject({ access_token: z.string().min(1) });

async function fetchProfile(config: OAuthConfig, provider: OAuthProvider, code: string, verifier: string): Promise<ProviderProfile> {
  const { clientId, clientSecret } = credentialsOf(config, provider);
  const def = providers[provider];
  const http = config.fetch ?? fetch;
  const signal = AbortSignal.timeout(15_000);

  const tokenRes = await http(def.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(config, provider),
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: verifier,
    }),
    signal,
  });
  const token = Token.safeParse(await tokenRes.json().catch(() => null));
  if (!tokenRes.ok || !token.success) throw new ApiError(502, "internal", `${def.label} did not accept the login`);

  const profileRes = await http(def.profileUrl, {
    headers: { Authorization: `Bearer ${token.data.access_token}`, Accept: "application/json", "User-Agent": "Magpie" },
    signal,
  });
  if (!profileRes.ok) throw new ApiError(502, "internal", `${def.label} did not return a profile`);
  try {
    return def.parseProfile(await profileRes.json());
  } catch {
    throw new ApiError(502, "internal", `${def.label} returned an unexpected profile`);
  }
}

/** Outcome of the provider callback, as the query the app is redirected back with. */
export type CallbackOutcome = { status: "ticket"; ticket: string } | { status: "linked" } | { status: "error"; message: string };

export function appRedirect(outcome: CallbackOutcome): string {
  const url = new URL(OAUTH_APP_REDIRECT);
  url.searchParams.set("status", outcome.status);
  if (outcome.status === "ticket") url.searchParams.set("ticket", outcome.ticket);
  if (outcome.status === "error") url.searchParams.set("message", outcome.message);
  return url.href;
}

export async function callback(
  db: Database,
  config: OAuthConfig,
  provider: OAuthProvider,
  query: { code?: string | undefined; state?: string | undefined; error?: string | undefined },
): Promise<CallbackOutcome> {
  if (query.error) return { status: "error", message: "The login was cancelled" };
  if (!query.code || !query.state) return { status: "error", message: "The provider sent no login" };
  const row = await take(db, "state", query.state, provider);
  const state = row ? StatePayload.safeParse(row.payload) : null;
  if (!state?.success) return { status: "error", message: "This login expired. Start again" };

  let profile: ProviderProfile;
  try {
    profile = await fetchProfile(config, provider, query.code, state.data.verifier);
  } catch (error) {
    return { status: "error", message: error instanceof ApiError ? error.message : "The login failed" };
  }

  const [existing] = await db
    .select({ id: authIdentities.id, userId: authIdentities.userId })
    .from(authIdentities)
    .where(and(eq(authIdentities.provider, provider), eq(authIdentities.providerUserId, profile.id)));

  if (state.data.mode === "link") {
    if (!state.data.userId) return { status: "error", message: "This login expired. Start again" };
    if (existing && existing.userId !== state.data.userId) return { status: "error", message: `That ${providers[provider].label} account is linked to someone else` };
    if (!existing) {
      try {
        await db.insert(authIdentities).values({ userId: state.data.userId, provider, providerUserId: profile.id, email: profile.email, lastLoginAt: new Date() });
      } catch (error) {
        // the person already linked a different account of this provider
        if (isUniqueViolation(error)) return { status: "error", message: `You already linked a ${providers[provider].label} account` };
        throw error;
      }
    }
    return { status: "linked" };
  }

  const ticket = random();
  const payload: z.infer<typeof TicketPayload> = existing
    ? { kind: "known", userId: existing.userId, identityId: existing.id }
    : { kind: "new", providerUserId: profile.id, email: profile.email, suggestedUsername: suggestUsername(profile.nameHint) };
  await save(db, "ticket", ticket, provider, payload, TICKET_TTL_MS);
  return { status: "ticket", ticket };
}

async function openSession(db: Pick<Database, "insert">, userId: string, label: string | null): Promise<string> {
  const token = newSessionToken();
  await db.insert(sessions).values({ userId, tokenHash: hashToken(token), label, expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * DAY_MS) });
  return token;
}

/**
 * Swaps a ticket for a session. A first-time identity must also bring a username (and an invite code
 * while registration is invite-only); until then the answer says what is missing and the ticket stays valid.
 */
export async function exchange(
  db: Database,
  mode: RegistrationMode,
  body: OAuthExchangeBody,
  label: string | null,
  me: (userId: string) => Promise<MeResponse | null>,
): Promise<OAuthExchangeResponse> {
  const [peek] = await db
    .select()
    .from(oauthTransactions)
    .where(and(eq(oauthTransactions.kind, "ticket"), eq(oauthTransactions.tokenHash, hashToken(body.ticket)), gt(oauthTransactions.expiresAt, new Date())));
  const ticket = peek ? TicketPayload.safeParse(peek.payload) : null;
  if (!peek || !ticket?.success) throw new ApiError(401, "unauthorized", "This login expired. Start again");
  const provider = peek.provider as OAuthProvider;

  if (ticket.data.kind === "known") {
    const { userId, identityId } = ticket.data;
    // a suspended or deleted account has no profile to hand back
    const account = await me(userId);
    if (!account) throw new ApiError(401, "unauthorized", "This account cannot sign in");
    const token = await db.transaction(async (tx) => {
      const used = await tx.delete(oauthTransactions).where(eq(oauthTransactions.id, peek.id)).returning({ id: oauthTransactions.id });
      if (used.length === 0) throw new ApiError(401, "unauthorized", "This login was already used");
      await tx.update(authIdentities).set({ lastLoginAt: new Date() }).where(eq(authIdentities.id, identityId));
      return openSession(tx, userId, label);
    });
    return { status: "ok", token, me: account };
  }

  const { providerUserId, email, suggestedUsername } = ticket.data;
  if (!body.username || (mode === "invite" && !body.inviteCode)) {
    return { status: "signup_required", provider, suggestedUsername, inviteRequired: mode === "invite" };
  }
  const username = body.username;

  const userId = await db
    .transaction(async (tx) => {
      const used = await tx.delete(oauthTransactions).where(eq(oauthTransactions.id, peek.id)).returning({ id: oauthTransactions.id });
      if (used.length === 0) throw new ApiError(401, "unauthorized", "This login was already used");
      const inviteId = mode === "invite" && body.inviteCode ? await claimInvite(tx, body.inviteCode) : null;
      const [user] = await tx.insert(users).values({ name: username }).returning({ id: users.id });
      if (!user) throw new Error("insert returned no row");
      await tx.insert(authIdentities).values({ userId: user.id, provider, providerUserId, email, lastLoginAt: new Date() });
      if (inviteId) await markInviteUsedBy(tx, inviteId, user.id);
      return user.id;
    })
    .catch((error: unknown) => {
      // the transaction rolled back, ticket and invite included: the person can pick another name and retry
      if (isUniqueViolation(error)) throw new ApiError(409, "conflict", "That username is taken");
      throw error;
    });
  const account = await me(userId);
  if (!account) throw new ApiError(500, "internal", "Account missing after signup");
  return { status: "ok", token: await openSession(db, userId, label), me: account };
}

// ── linked identities ───────────────────────────────────────────────────

export async function listIdentities(db: Database, userId: string) {
  const [account] = await db.select({ hasPassword: sql<boolean>`${users.passwordHash} is not null` }).from(users).where(eq(users.id, userId));
  const rows = await db.select().from(authIdentities).where(eq(authIdentities.userId, userId)).orderBy(authIdentities.createdAt);
  return {
    hasPassword: account?.hasPassword ?? false,
    identities: rows.flatMap((r) => {
      const provider = z.enum(["google", "github", "discord"]).safeParse(r.provider);
      return provider.success
        ? [{ provider: provider.data, email: r.email, linkedAt: r.createdAt.toISOString(), lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null }]
        : [];
    }),
  };
}

/** Removing a login method is refused when it is the last way into the account. */
export async function unlink(db: Database, userId: string, provider: OAuthProvider): Promise<void> {
  const [account] = await db.select({ hasPassword: sql<boolean>`${users.passwordHash} is not null`, hasToken: sql<boolean>`${users.tokenHash} is not null` }).from(users).where(eq(users.id, userId));
  const rows = await db.select({ provider: authIdentities.provider }).from(authIdentities).where(eq(authIdentities.userId, userId));
  const remaining = rows.filter((r) => r.provider !== provider).length;
  if (!account?.hasPassword && !account?.hasToken && remaining === 0) {
    throw new ApiError(409, "conflict", "This is your only way to sign in. Set a password or link another login first");
  }
  await db.delete(authIdentities).where(and(eq(authIdentities.userId, userId), eq(authIdentities.provider, provider)));
}
