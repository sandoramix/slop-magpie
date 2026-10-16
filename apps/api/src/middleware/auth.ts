import { createHash, timingSafeEqual } from "node:crypto";
import { ADMIN_USER_ID } from "@magpie/db";
import { ACT_AS_HEADER } from "@magpie/shared/api";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import type { AccountLookup, AppEnv, AuditEvent, Principal } from "../deps.ts";
import { clientIp } from "../http/client-ip.ts";
import { errorResponse } from "../http/errors.ts";
import type { FailureLimiter } from "./rate-limit.ts";

const digest = (value: string): Buffer => createHash("sha256").update(value).digest();

/** Account tokens are stored as this hash (hex); the plaintext is shown once at creation. */
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export interface BearerAuthOptions {
  /** The admin token (API_TOKEN). */
  token: string;
  accounts: AccountLookup;
  limiter: FailureLimiter;
  trustProxy: boolean;
  audit: (event: AuditEvent) => Promise<void>;
}

/**
 * Two kinds of bearer token (docs/security.md): the static admin token from the environment and
 * per-account tokens stored as hashes. Kept in one middleware so it can be swapped for real auth
 * without touching routes. An admin may send `X-Magpie-Act-As: <account id>` to work inside
 * another account's library.
 */
export function bearerAuth(options: BearerAuthOptions) {
  const expected = digest(options.token);

  return createMiddleware<AppEnv>(async (c, next) => {
    const ip = clientIp(c, options.trustProxy);
    const limiterKey = ip ?? "unknown";
    if (options.limiter.isBlocked(limiterKey)) {
      return errorResponse(c, 429, "rate_limited", "Too many failed attempts");
    }

    const header = c.req.header("authorization") ?? "";
    const match = /^Bearer (.+)$/i.exec(header);
    const presented = match?.[1];

    let principal: Principal | null = null;
    // hashing first makes the comparison constant-time regardless of length
    if (presented && timingSafeEqual(digest(presented), expected)) {
      // the admin row is looked up so its display name shows; unit tests without a database fall back to the constant
      const row = await options.accounts.findById(ADMIN_USER_ID);
      principal = {
        id: ADMIN_USER_ID,
        name: row?.name ?? "Admin",
        displayName: row?.displayName ?? null,
        isAdmin: true,
        hasPassword: row?.hasPassword ?? false,
        sessionTokenHash: null,
        actingAs: null,
        libraryId: ADMIN_USER_ID,
      };
    } else if (presented) {
      const tokenHash = hashToken(presented);
      const account = await options.accounts.findByTokenHash(tokenHash);
      if (account) {
        const { sessionId, ...rest } = account;
        principal = { ...rest, sessionTokenHash: sessionId ? tokenHash : null, actingAs: null, libraryId: account.id };
      }
    }

    if (!principal) {
      const crossed = options.limiter.recordFailure(limiterKey);
      await options.audit({
        action: crossed ? "auth.rate_limited" : "auth.fail",
        ip,
        userAgent: c.req.header("user-agent") ?? null,
        details: { path: c.req.path, reason: match ? "bad_token" : "missing_token" },
      });
      return errorResponse(c, 401, "unauthorized", "Missing or invalid token");
    }

    const actAs = c.req.header(ACT_AS_HEADER);
    if (actAs) {
      if (!principal.isAdmin) return errorResponse(c, 403, "forbidden", "Only the admin can act as another account");
      const targetId = z.uuid().safeParse(actAs);
      const target = targetId.success ? await options.accounts.findById(targetId.data) : null;
      if (!target) return errorResponse(c, 404, "not_found", "Account not found");
      if (target.id !== principal.id) {
        principal = { ...principal, actingAs: { id: target.id, name: target.name, displayName: target.displayName }, libraryId: target.id };
        // reads are not logged; anything that changes another account's library is
        if (c.req.method !== "GET" && c.req.method !== "HEAD") {
          await options.audit({
            action: "admin.act_as",
            ip,
            userAgent: c.req.header("user-agent") ?? null,
            details: { target: target.id, method: c.req.method, path: c.req.path },
          });
        }
      }
    }

    c.set("principal", principal);
    await next();
  });
}
