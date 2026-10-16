import { LoginBody, type LoginResponse } from "@magpie/shared/api";
import { Hono } from "hono";
import type { AppDeps } from "../deps.ts";
import { clientIp } from "../http/client-ip.ts";
import { errorResponse } from "../http/errors.ts";
import { validate } from "../http/validate.ts";
import type { FailureLimiter } from "../middleware/rate-limit.ts";
import * as credentials from "../services/credentials.ts";
import { whoAmI } from "../services/users.ts";

/**
 * Public (no bearer token): trade username + password for a session token. Failures count per IP
 * and per username so neither a single client nor a distributed guess run gets many tries.
 */
export const authRoutes = (deps: AppDeps, limiter: FailureLimiter) =>
  new Hono().post("/login", validate("json", LoginBody), async (c) => {
    const { username, password } = c.req.valid("json");
    const ip = clientIp(c, deps.trustProxy);
    const keys = [`ip:${ip ?? "unknown"}`, `user:${username.toLowerCase()}`];
    if (keys.some((k) => limiter.isBlocked(k))) return errorResponse(c, 429, "rate_limited", "Too many failed attempts");

    const userAgent = c.req.header("user-agent") ?? null;
    const session = await credentials.login(deps.db, username, password, userAgent?.slice(0, 200) ?? null);
    if (!session) {
      const crossed = keys.map((k) => limiter.recordFailure(k)).some(Boolean);
      await deps.audit({
        action: crossed ? "auth.rate_limited" : "auth.login_fail",
        ip,
        userAgent,
        // the username is not a secret, the password never is logged
        details: { username: username.slice(0, 100) },
      });
      return errorResponse(c, 401, "unauthorized", "Wrong username or password");
    }

    const account = await deps.accounts.findById(session.userId);
    if (!account) return errorResponse(c, 401, "unauthorized", "Wrong username or password");
    await deps.audit({ action: "auth.login", ip, userAgent, details: { id: account.id } });
    const body: LoginResponse = {
      token: session.token,
      me: whoAmI({ ...account, actingAs: null }),
    };
    return c.json(body, 200);
  });
