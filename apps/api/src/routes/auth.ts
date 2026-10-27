import { LoginBody, type LoginResponse, type RegistrationConfig, SignupBody } from "@magpie/shared/api";
import { Hono } from "hono";
import type { AppDeps } from "../deps.ts";
import { clientIp } from "../http/client-ip.ts";
import { errorResponse } from "../http/errors.ts";
import { validate } from "../http/validate.ts";
import type { FailureLimiter } from "../middleware/rate-limit.ts";
import * as credentials from "../services/credentials.ts";
import * as signup from "../services/signup.ts";
import { whoAmI } from "../services/users.ts";

/**
 * Public (no bearer token): trade username + password for a session token. Failures count per IP
 * and per username so neither a single client nor a distributed guess run gets many tries.
 */
export const authRoutes = (deps: AppDeps, limiter: FailureLimiter, signupLimiter: FailureLimiter) =>
  new Hono()
    // lets the app show or hide "create account" without guessing
    .get("/config", (c) => c.json({ mode: deps.registrationMode ?? "invite", providers: [...(deps.oauthProviders ?? [])] } satisfies RegistrationConfig, 200))
    .post("/signup", validate("json", SignupBody), async (c) => {
      const ip = clientIp(c, deps.trustProxy);
      // every attempt counts, not just failures: this endpoint creates rows
      const key = `ip:${ip ?? "unknown"}`;
      if (signupLimiter.isBlocked(key)) return errorResponse(c, 429, "rate_limited", "Too many signups from this address, try again later");
      signupLimiter.recordFailure(key);
      const body = c.req.valid("json");
      const session = await signup.signup(deps.db, deps.registrationMode ?? "invite", body, c.req.header("user-agent")?.slice(0, 200) ?? null);
      const account = await deps.accounts.findById(session.userId);
      if (!account) return errorResponse(c, 500, "internal", "Account missing after signup");
      await deps.audit({ action: "auth.signup", ip, userAgent: c.req.header("user-agent") ?? null, details: { id: account.id } });
      return c.json({ token: session.token, me: whoAmI({ ...account, actingAs: null }) } satisfies LoginResponse, 201);
    })
    .post("/login", validate("json", LoginBody), async (c) => {
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
