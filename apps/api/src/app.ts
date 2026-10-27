import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import type { AppDeps } from "./deps.ts";
import { ApiError, errorBody, errorResponse } from "./http/errors.ts";
import { bearerAuth } from "./middleware/auth.ts";
import { createFailureLimiter } from "./middleware/rate-limit.ts";
import { adminPageRoutes } from "./routes/admin-page.ts";
import { healthRoutes } from "./routes/health.ts";
import { inviteRoutes } from "./routes/invite.ts";
import { itemsRoutes } from "./routes/items.ts";
import { mediaRoutes } from "./routes/media.ts";
import { fieldsRoutes, foldersRoutes, smartFoldersRoutes, statsRoutes, tagsRoutes } from "./routes/organize.ts";
import { authRoutes } from "./routes/auth.ts";
import { organizeExtrasRoutes } from "./routes/organize-extras.ts";
import { moderationRoutes, socialRoutes } from "./routes/social.ts";
import { sourcesRoutes } from "./routes/sources.ts";
import { meRoutes, usersRoutes } from "./routes/users.ts";

export const API_PREFIX = "/api/v1";
const MAX_BODY_BYTES = 64 * 1024;

export function createApp(deps: AppDeps) {
  const limiter = createFailureLimiter({ max: 10, windowMs: 15 * 60 * 1000 });
  // password logins count separately so a locked-out login does not lock out valid bearer tokens
  const loginLimiter = createFailureLimiter({ max: 10, windowMs: 15 * 60 * 1000 });
  // counts every signup attempt per IP, successful or not
  const signupLimiter = createFailureLimiter({ max: deps.signupLimit ?? 5, windowMs: 60 * 60 * 1000 });
  // every social login start, callback and exchange counts, per IP
  const oauthLimiter = createFailureLimiter({ max: deps.oauthLimit ?? 60, windowMs: 60 * 60 * 1000 });

  const api = new Hono()
    // public: no bearer token
    .route("/health", healthRoutes(deps))
    // authorized by the URL signature instead
    .route("/media", mediaRoutes(deps))
    // public too: it is how a password turns into a token
    .route("/auth", authRoutes(deps, loginLimiter, signupLimiter, oauthLimiter))
    // everything below needs the token, including unknown paths (401 before 404)
    .use("*", bearerAuth({ token: deps.apiToken, accounts: deps.accounts, limiter, trustProxy: deps.trustProxy, audit: deps.audit }))
    .route("/me", meRoutes(deps))
    .route("/users", usersRoutes(deps))
    .route("/sources", sourcesRoutes(deps))
    .route("/items", itemsRoutes(deps))
    .route("/folders", foldersRoutes(deps))
    .route("/tags", tagsRoutes(deps))
    .route("/fields", fieldsRoutes(deps))
    .route("/smart-folders", smartFoldersRoutes(deps))
    .route("/stats", statsRoutes(deps))
    .route("/", organizeExtrasRoutes(deps))
    .route("/", socialRoutes(deps))
    .route("/", moderationRoutes(deps));

  const app = new Hono();

  app.use("*", async (c, next) => {
    const start = performance.now();
    await next();
    // path only: query strings may carry media signatures
    const entry = { method: c.req.method, path: c.req.path, status: c.res.status, ms: Math.round(performance.now() - start) };
    // container healthchecks hit /health every 30 s
    if (c.req.path === `${API_PREFIX}/health` && c.res.ok) deps.log.debug(entry, "request");
    else deps.log.info(entry, "request");
  });
  app.use(
    "*",
    secureHeaders({
      strictTransportSecurity: "max-age=63072000; includeSubDomains",
      xContentTypeOptions: "nosniff",
      referrerPolicy: "no-referrer",
    }),
  );
  if (deps.corsOrigins.length > 0) {
    app.use("*", cors({ origin: [...deps.corsOrigins], allowHeaders: ["Authorization", "Content-Type"], maxAge: 600 }));
  }
  app.use(
    "*",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => errorResponse(c, 413, "bad_request", "Request body too large"),
    }),
  );

  // public landing page for invite links (not part of the versioned API)
  app.route("/invite", inviteRoutes());
  // optional: ADMIN_WEB_UI=false removes the page; the API behind it stays admin-only either way
  if (deps.adminWebUi !== false) app.route("/admin", adminPageRoutes());
  app.route(API_PREFIX, api);

  app.notFound((c) => errorResponse(c, 404, "not_found", "Not found"));
  app.onError((error, c) => {
    if (error instanceof ApiError) return errorResponse(c, error.status, error.code, error.message);
    if (error instanceof HTTPException && error.status < 500) {
      return c.json(errorBody("bad_request", error.message), error.status);
    }
    deps.log.error({ err: error, path: c.req.path }, "unhandled error");
    return errorResponse(c, 500, "internal", "Internal error");
  });

  return { app, api };
}
