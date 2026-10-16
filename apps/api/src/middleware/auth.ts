import { createHash, timingSafeEqual } from "node:crypto";
import { createMiddleware } from "hono/factory";
import type { AuditEvent } from "../deps.ts";
import { clientIp } from "../http/client-ip.ts";
import { errorResponse } from "../http/errors.ts";
import type { FailureLimiter } from "./rate-limit.ts";

const digest = (value: string): Buffer => createHash("sha256").update(value).digest();

export interface BearerAuthOptions {
  token: string;
  limiter: FailureLimiter;
  trustProxy: boolean;
  audit: (event: AuditEvent) => Promise<void>;
}

/**
 * Single static bearer token (docs/security.md). Kept in one middleware so it can be swapped
 * for real auth without touching routes.
 */
export function bearerAuth(options: BearerAuthOptions) {
  const expected = digest(options.token);

  return createMiddleware(async (c, next) => {
    const ip = clientIp(c, options.trustProxy);
    const limiterKey = ip ?? "unknown";
    if (options.limiter.isBlocked(limiterKey)) {
      return errorResponse(c, 429, "rate_limited", "Too many failed attempts");
    }

    const header = c.req.header("authorization") ?? "";
    const match = /^Bearer (.+)$/i.exec(header);
    // hashing first makes the comparison constant-time regardless of length
    if (match?.[1] && timingSafeEqual(digest(match[1]), expected)) {
      await next();
      return;
    }

    const crossed = options.limiter.recordFailure(limiterKey);
    await options.audit({
      action: crossed ? "auth.rate_limited" : "auth.fail",
      ip,
      userAgent: c.req.header("user-agent") ?? null,
      details: { path: c.req.path, reason: match ? "bad_token" : "missing_token" },
    });
    return errorResponse(c, 401, "unauthorized", "Missing or invalid token");
  });
}
