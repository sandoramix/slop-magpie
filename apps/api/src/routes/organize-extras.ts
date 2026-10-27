import { AddStopTermBody, AutoFiledActionBody, type AutoFiledActionResponse, StopTermParam, TopicsQuery } from "@magpie/shared/api";
import { Hono } from "hono";
import type { AppDeps, AppEnv } from "../deps.ts";
import { scopeOf } from "../http/scope.ts";
import { validate } from "../http/validate.ts";
import * as svc from "../services/organize-extras.ts";

/** Stop terms, topic clusters and the review of automatic filing. Additive to v1 (D24). */
export const organizeExtrasRoutes = (deps: AppDeps) =>
  new Hono<AppEnv>()
    .get("/stop-terms", async (c) => c.json(await svc.listStopTerms(scopeOf(deps, c)), 200))
    .post("/stop-terms", validate("json", AddStopTermBody), async (c) => c.json(await svc.addStopTerm(scopeOf(deps, c), c.req.valid("json").term), 201))
    .delete("/stop-terms/:term", validate("param", StopTermParam), async (c) =>
      c.json(await svc.removeStopTerm(scopeOf(deps, c), c.req.valid("param").term), 200),
    )
    .get("/topics", validate("query", TopicsQuery), async (c) => c.json(await svc.listTopics(scopeOf(deps, c), c.req.valid("query")), 200))
    .get("/auto-filed", async (c) => c.json(await svc.listAutoFiled(scopeOf(deps, c)), 200))
    .post("/auto-filed/keep", validate("json", AutoFiledActionBody), async (c) =>
      c.json({ affected: await svc.keepAutoFiled(scopeOf(deps, c), c.req.valid("json")) } satisfies AutoFiledActionResponse, 200),
    )
    .post("/auto-filed/undo", validate("json", AutoFiledActionBody), async (c) =>
      c.json({ affected: await svc.undoAutoFiled(scopeOf(deps, c), c.req.valid("json")) } satisfies AutoFiledActionResponse, 200),
    );
