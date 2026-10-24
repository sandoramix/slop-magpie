import {
  CredentialKindParam,
  type CredentialsStatus,
  SetCredentialBody,
  SourceIdParam,
  type SourcesResponse,
} from "@magpie/shared/api";
import { allSources, isSourceId } from "@magpie/shared/sources";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { AppDeps, AppEnv } from "../deps.ts";
import { errorResponse } from "../http/errors.ts";
import { requestMeta } from "../http/request-meta.ts";
import { validate } from "../http/validate.ts";
import * as creds from "../services/source-credentials.ts";

// login material is deployment-wide, not part of any library
const adminOnly = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get("principal").isAdmin) return errorResponse(c, 403, "forbidden", "Admin only");
  await next();
});

const knownSource = createMiddleware<AppEnv>(async (c, next) => {
  if (!isSourceId(c.req.param("id") ?? "")) return errorResponse(c, 404, "not_found", "Unknown source");
  await next();
});

export const sourcesRoutes = (deps: AppDeps) =>
  new Hono<AppEnv>()
    .get("/", async (c) => {
      const counts = await deps.countItemsBySource(c.get("principal").libraryId);
      const body: SourcesResponse = {
        sources: allSources.map((s) => ({
          id: s.id,
          label: s.label,
          hosts: [...s.hosts],
          itemCount: counts.get(s.id) ?? 0,
        })),
      };
      return c.json(body, 200);
    })
    .get("/:id/credentials", adminOnly, knownSource, validate("param", SourceIdParam), async (c) =>
      c.json(await creds.credentialsStatus(deps.db, c.req.valid("param").id) satisfies CredentialsStatus, 200),
    )
    .put("/:id/credentials/:kind", adminOnly, knownSource, validate("param", CredentialKindParam), validate("json", SetCredentialBody), async (c) => {
      const { id, kind } = c.req.valid("param");
      await creds.setCredential(deps.db, id, kind, c.req.valid("json").content);
      await deps.audit({ action: "source.credentials_set", ...requestMeta(c, deps.trustProxy), details: { source: id, kind } });
      // the worker picks the new material up and re-checks the session right away
      await deps.jobs.sendJob("sessionCheck");
      return c.json(await creds.credentialsStatus(deps.db, id) satisfies CredentialsStatus, 200);
    })
    .delete("/:id/credentials/:kind", adminOnly, knownSource, validate("param", CredentialKindParam), async (c) => {
      const { id, kind } = c.req.valid("param");
      await creds.deleteCredential(deps.db, id, kind);
      await deps.audit({ action: "source.credentials_deleted", ...requestMeta(c, deps.trustProxy), details: { source: id, kind } });
      return c.json(await creds.credentialsStatus(deps.db, id) satisfies CredentialsStatus, 200);
    })
    .post("/:id/credentials/check", adminOnly, knownSource, validate("param", SourceIdParam), async (c) => {
      await deps.jobs.sendJob("sessionCheck");
      return c.json(await creds.credentialsStatus(deps.db, c.req.valid("param").id) satisfies CredentialsStatus, 202);
    });
