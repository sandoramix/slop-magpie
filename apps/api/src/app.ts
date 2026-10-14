import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import type { AppDeps } from "./deps.ts";
import { ApiError, errorBody, errorResponse } from "./http/errors.ts";
import { bearerAuth } from "./middleware/auth.ts";
import { createFailureLimiter } from "./middleware/rate-limit.ts";
import { healthRoutes } from "./routes/health.ts";
import { sourcesRoutes } from "./routes/sources.ts";

export const API_PREFIX = "/api/v1";
const MAX_BODY_BYTES = 64 * 1024;

export function createApp(deps: AppDeps) {
  const limiter = createFailureLimiter({ max: 10, windowMs: 15 * 60 * 1000 });

  const api = new Hono()
    // public: no bearer token
    .route("/health", healthRoutes(deps))
    // everything below needs the token, including unknown paths (401 before 404)
    .use("*", bearerAuth({ token: deps.apiToken, limiter, trustProxy: deps.trustProxy, audit: deps.audit }))
    .route("/sources", sourcesRoutes(deps));

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

export type ApiRoutes = ReturnType<typeof createApp>["api"];
