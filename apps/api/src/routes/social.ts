import {
  CreateReportBody,
  DashboardFeedbackQuery,
  ExploreQuery,
  FeedQuery,
  IdParam,
  MarkReadBody,
  NotificationListQuery,
  PeopleSearchQuery,
  ProfileParam,
  ReportListQuery,
  ResolveReportBody,
  SaveListQuery,
  type SaverCountResponse,
  SetFeedbackBody,
  UpdateProfileBody,
  UpdateSaveBody,
} from "@magpie/shared/api";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../deps.ts";
import { requestMeta } from "../http/request-meta.ts";
import { scopeOf } from "../http/scope.ts";
import { validate } from "../http/validate.ts";
import * as feedback from "../services/feedback.ts";
import * as moderation from "../services/moderation.ts";
import * as notifications from "../services/notifications.ts";
import * as people from "../services/people.ts";
import * as posts from "../services/posts.ts";
import * as signup from "../services/signup.ts";
import { adminOnly } from "./users.ts";

/** Everything social, mounted at the API root. All of it is additive to v1 (D24). */
export const socialRoutes = (deps: AppDeps) =>
  new Hono<AppEnv>()
    // ── discovery ───────────────────────────────────────────────────────
    .get("/feed", validate("query", FeedQuery), async (c) => c.json(await posts.feed(scopeOf(deps, c), c.req.valid("query")), 200))
    .get("/explore", validate("query", ExploreQuery), async (c) => c.json(await posts.explore(scopeOf(deps, c), c.req.valid("query")), 200))
    .get("/saves", validate("query", SaveListQuery), async (c) => c.json(await posts.listSaves(scopeOf(deps, c), c.req.valid("query")), 200))

    // ── one post ────────────────────────────────────────────────────────
    .get("/posts/:id", validate("param", IdParam), async (c) => c.json(await posts.getPost(scopeOf(deps, c), c.req.valid("param").id), 200))
    .get("/posts/:id/savers", validate("param", IdParam), async (c) =>
      c.json({ count: await posts.saverCount(scopeOf(deps, c), c.req.valid("param").id) } satisfies SaverCountResponse, 200),
    )
    .put("/posts/:id/like", validate("param", IdParam), async (c) => {
      await posts.setLike(scopeOf(deps, c), c.req.valid("param").id, true);
      return c.json(await posts.getPost(scopeOf(deps, c), c.req.valid("param").id), 200);
    })
    .delete("/posts/:id/like", validate("param", IdParam), async (c) => {
      await posts.setLike(scopeOf(deps, c), c.req.valid("param").id, false);
      return c.json(await posts.getPost(scopeOf(deps, c), c.req.valid("param").id), 200);
    })
    .put("/posts/:id/save", validate("param", IdParam), async (c) => {
      await posts.savePost(scopeOf(deps, c), c.req.valid("param").id);
      return c.json(await posts.getPost(scopeOf(deps, c), c.req.valid("param").id), 200);
    })
    .patch("/posts/:id/save", validate("param", IdParam), validate("json", UpdateSaveBody), async (c) =>
      c.json(await posts.updateSave(scopeOf(deps, c), c.req.valid("param").id, c.req.valid("json")), 200),
    )
    .delete("/posts/:id/save", validate("param", IdParam), async (c) => {
      await posts.unsavePost(scopeOf(deps, c), c.req.valid("param").id);
      return c.body(null, 204);
    })

    // ── feedback ────────────────────────────────────────────────────────
    .put("/posts/:id/feedback", validate("param", IdParam), validate("json", SetFeedbackBody), async (c) => {
      await feedback.setFeedback(scopeOf(deps, c), c.req.valid("param").id, c.req.valid("json"));
      return c.json(await posts.getPost(scopeOf(deps, c), c.req.valid("param").id), 200);
    })
    .delete("/posts/:id/feedback", validate("param", IdParam), async (c) => {
      await feedback.deleteFeedback(scopeOf(deps, c), c.req.valid("param").id);
      return c.json(await posts.getPost(scopeOf(deps, c), c.req.valid("param").id), 200);
    })
    .post("/posts/:id/feedback/snooze", validate("param", IdParam), async (c) => {
      await feedback.snoozeFeedback(scopeOf(deps, c), c.req.valid("param").id);
      return c.body(null, 204);
    })
    .put("/posts/:id/tried", validate("param", IdParam), async (c) => {
      await feedback.setTried(scopeOf(deps, c), c.req.valid("param").id, true);
      return c.json(await posts.getPost(scopeOf(deps, c), c.req.valid("param").id), 200);
    })
    .delete("/posts/:id/tried", validate("param", IdParam), async (c) => {
      await feedback.setTried(scopeOf(deps, c), c.req.valid("param").id, false);
      return c.json(await posts.getPost(scopeOf(deps, c), c.req.valid("param").id), 200);
    })
    .get("/feedback/prompts", async (c) => {
      const scope = scopeOf(deps, c);
      return c.json({ prompts: await posts.postsByIds(scope, await feedback.duePromptIds(scope)) }, 200);
    })

    // ── dashboard ───────────────────────────────────────────────────────
    .get("/dashboard/progress", async (c) => c.json(await feedback.progress(scopeOf(deps, c)), 200))
    .get("/dashboard/feedback", validate("query", DashboardFeedbackQuery), async (c) =>
      c.json(await feedback.dashboardFeedback(scopeOf(deps, c), c.req.valid("query")), 200),
    )

    // ── people ──────────────────────────────────────────────────────────
    .get("/profiles/search", validate("query", PeopleSearchQuery), async (c) => c.json(await people.searchPeople(scopeOf(deps, c), c.req.valid("query").q), 200))
    .get("/profiles/blocked", async (c) => c.json(await people.listBlocked(scopeOf(deps, c)), 200))
    .put("/profiles/me", validate("json", UpdateProfileBody), async (c) => {
      await people.updateBio(scopeOf(deps, c), c.req.valid("json"));
      return c.body(null, 204);
    })
    .get("/profiles/:name", validate("param", ProfileParam), async (c) => c.json(await people.getProfile(scopeOf(deps, c), c.req.valid("param").name), 200))
    .get("/profiles/:name/posts", validate("param", ProfileParam), validate("query", FeedQuery), async (c) => {
      const scope = scopeOf(deps, c);
      const ownerId = await people.resolveName(scope.db, scope.userId, c.req.valid("param").name);
      const { cursor, limit } = c.req.valid("query");
      return c.json(await posts.postsOf(scope, ownerId, cursor, limit), 200);
    })
    .put("/profiles/:name/follow", validate("param", ProfileParam), async (c) => c.json(await people.setFollow(scopeOf(deps, c), c.req.valid("param").name, true), 200))
    .delete("/profiles/:name/follow", validate("param", ProfileParam), async (c) => c.json(await people.setFollow(scopeOf(deps, c), c.req.valid("param").name, false), 200))
    .put("/profiles/:name/block", validate("param", ProfileParam), async (c) => {
      await people.setBlock(scopeOf(deps, c), c.req.valid("param").name, true);
      return c.body(null, 204);
    })
    .delete("/profiles/:name/block", validate("param", ProfileParam), async (c) => {
      await people.setBlock(scopeOf(deps, c), c.req.valid("param").name, false);
      return c.body(null, 204);
    })

    // ── notifications ───────────────────────────────────────────────────
    .get("/notifications", validate("query", NotificationListQuery), async (c) =>
      c.json(await notifications.listNotifications(scopeOf(deps, c), c.req.valid("query")), 200),
    )
    .post("/notifications/read", validate("json", MarkReadBody), async (c) => {
      await notifications.markRead(scopeOf(deps, c), c.req.valid("json"));
      return c.body(null, 204);
    })

    // ── safety ──────────────────────────────────────────────────────────
    .post("/reports", validate("json", CreateReportBody), async (c) => {
      await moderation.createReport(scopeOf(deps, c), c.req.valid("json"));
      return c.body(null, 204);
    });

/** Admin tools: invites and moderation. */
export const moderationRoutes = (deps: AppDeps) =>
  new Hono<AppEnv>()
    // scoped by path: mounted at the API root, a "*" guard would also turn unknown paths into 403
    .use("/invites", adminOnly)
    .use("/moderation/*", adminOnly)
    .post("/invites", async (c) => {
      const invite = await signup.createInvite(deps.db, c.get("principal").id);
      await deps.audit({ action: "invite.create", ...requestMeta(c, deps.trustProxy) });
      return c.json(invite, 201);
    })
    .get("/moderation/reports", validate("query", ReportListQuery), async (c) => c.json(await moderation.listReports(deps.db, c.req.valid("query")), 200))
    .post("/moderation/reports/:id", validate("param", IdParam), validate("json", ResolveReportBody), async (c) => {
      const { id } = c.req.valid("param");
      const { action } = c.req.valid("json");
      await moderation.resolveReport(deps.db, id, c.req.valid("json"));
      await deps.audit({ action: "moderation.resolve", ...requestMeta(c, deps.trustProxy), details: { id, action } });
      return c.body(null, 204);
    })
    .post("/moderation/items/:id/:state", validate("param", IdParam.extend({ state: z.enum(["hide", "unhide"]) })), async (c) => {
      const { id, state } = c.req.valid("param");
      await moderation.setHidden(deps.db, id, state === "hide");
      await deps.audit({ action: `moderation.${state}`, ...requestMeta(c, deps.trustProxy), details: { id } });
      return c.body(null, 204);
    })
    .post("/moderation/users/:id/:state", validate("param", IdParam.extend({ state: z.enum(["suspend", "unsuspend"]) })), async (c) => {
      const { id, state } = c.req.valid("param");
      await moderation.suspend(deps.db, id, state === "suspend");
      await deps.audit({ action: `moderation.${state}`, ...requestMeta(c, deps.trustProxy), details: { id } });
      return c.body(null, 204);
    });
