import { LoginBody, type LoginResponse, OAuthExchangeBody, type OAuthStartResponse, ProviderParam, type RegistrationConfig, SignupBody } from "@magpie/shared/api";
import { type Context, Hono } from "hono";
import type { AppDeps } from "../deps.ts";
import { clientIp } from "../http/client-ip.ts";
import { errorResponse } from "../http/errors.ts";
import { validate } from "../http/validate.ts";
import type { FailureLimiter } from "../middleware/rate-limit.ts";
import * as credentials from "../services/credentials.ts";
import * as oauth from "../services/oauth.ts";
import * as signup from "../services/signup.ts";
import { whoAmI } from "../services/users.ts";

/**
 * Public (no bearer token): trade username + password for a session token. Failures count per IP
 * and per username so neither a single client nor a distributed guess run gets many tries.
 */
export const authRoutes = (deps: AppDeps, limiter: FailureLimiter, signupLimiter: FailureLimiter, oauthLimiter: FailureLimiter) => {
  /** Counts a social login step per IP; true when the caller is over the limit. */
  const throttled = (c: Context): boolean => {
    const key = `ip:${clientIp(c, deps.trustProxy) ?? "unknown"}`;
    if (oauthLimiter.isBlocked(key)) return true;
    oauthLimiter.recordFailure(key);
    return false;
  };

  return new Hono()
    // lets the app show or hide "create account" and the social login buttons without guessing
    .get("/config", (c) =>
      c.json({ mode: deps.registrationMode ?? "invite", providers: deps.oauth ? oauth.configuredProviders(deps.oauth) : [] } satisfies RegistrationConfig, 200),
    )
    .post("/oauth/exchange", validate("json", OAuthExchangeBody), async (c) => {
      if (throttled(c)) return errorResponse(c, 429, "rate_limited", "Too many login attempts, try again later");
      const result = await oauth.exchange(
        deps.db,
        deps.registrationMode ?? "invite",
        c.req.valid("json"),
        c.req.header("user-agent")?.slice(0, 200) ?? null,
        async (userId) => {
          const account = await deps.accounts.findById(userId);
          return account ? whoAmI({ ...account, actingAs: null }) : null;
        },
      );
      if (result.status === "ok") {
        await deps.audit({ action: "auth.oauth_login", ip: clientIp(c, deps.trustProxy), userAgent: c.req.header("user-agent") ?? null, details: { id: result.me.id } });
      }
      return c.json(result, 200);
    })
    .post("/oauth/:provider/start", validate("param", ProviderParam), async (c) => {
      if (throttled(c)) return errorResponse(c, 429, "rate_limited", "Too many login attempts, try again later");
      if (!deps.oauth) return errorResponse(c, 404, "not_found", "That login method is not available on this server");
      const url = await oauth.start(deps.db, deps.oauth, c.req.valid("param").provider, "login");
      return c.json({ url } satisfies OAuthStartResponse, 200);
    })
    // the provider sends the browser here; the answer is a redirect back into the app
    .get("/oauth/:provider/callback", validate("param", ProviderParam), async (c) => {
      if (throttled(c) || !deps.oauth) return c.redirect(oauth.appRedirect({ status: "error", message: "Login is not available right now" }), 302);
      const outcome = await oauth.callback(deps.db, deps.oauth, c.req.valid("param").provider, {
        code: c.req.query("code"),
        state: c.req.query("state"),
        error: c.req.query("error"),
      });
      return c.redirect(oauth.appRedirect(outcome), 302);
    })
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
};
