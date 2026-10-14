import type { HealthResponse } from "@magpie/shared/api";
import { Hono } from "hono";
import type { AppDeps } from "../deps.ts";

export const healthRoutes = (deps: AppDeps) =>
  new Hono().get("/", async (c) => {
    try {
      await deps.checkDb();
      return c.json({ ok: true, version: deps.version } satisfies HealthResponse, 200);
    } catch (error) {
      deps.log.error({ err: error }, "health check: database unreachable");
      return c.json({ ok: false, version: deps.version } satisfies HealthResponse, 503);
    }
  });
