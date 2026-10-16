import {
  CreateFieldBody,
  CreateFolderBody,
  CreateSmartFolderBody,
  CreateTagBody,
  type FieldsResponse,
  type FoldersResponse,
  IdParam,
  MergeTagBody,
  type SmartFoldersResponse,
  type TagsResponse,
  UpdateFieldBody,
  UpdateFolderBody,
  UpdateSmartFolderBody,
  UpdateTagBody,
} from "@magpie/shared/api";
import { Hono } from "hono";
import type { AppDeps, AppEnv } from "../deps.ts";
import { scopeOf } from "../http/scope.ts";
import { requestMeta } from "../http/request-meta.ts";
import { validate } from "../http/validate.ts";
import * as svc from "../services/organize.ts";
import { getStats } from "../services/stats.ts";

export const foldersRoutes = (deps: AppDeps) =>
  new Hono<AppEnv>()
    .get("/", async (c) => c.json({ folders: await svc.listFolders(scopeOf(deps, c)) } satisfies FoldersResponse, 200))
    .post("/", validate("json", CreateFolderBody), async (c) => c.json(await svc.createFolder(scopeOf(deps, c), c.req.valid("json")), 201))
    .patch("/:id", validate("param", IdParam), validate("json", UpdateFolderBody), async (c) =>
      c.json(await svc.updateFolder(scopeOf(deps, c), c.req.valid("param").id, c.req.valid("json")), 200),
    )
    .delete("/:id", validate("param", IdParam), async (c) => {
      const { id } = c.req.valid("param");
      const { name } = await svc.deleteFolder(scopeOf(deps, c), id);
      await deps.audit({ action: "folder.delete", ...requestMeta(c, deps.trustProxy), details: { id, name } });
      return c.body(null, 204);
    });

export const tagsRoutes = (deps: AppDeps) =>
  new Hono<AppEnv>()
    .get("/", async (c) => c.json({ tags: await svc.listTags(scopeOf(deps, c)) } satisfies TagsResponse, 200))
    .post("/", validate("json", CreateTagBody), async (c) => c.json(await svc.createTag(scopeOf(deps, c), c.req.valid("json")), 201))
    .patch("/:id", validate("param", IdParam), validate("json", UpdateTagBody), async (c) =>
      c.json(await svc.updateTag(scopeOf(deps, c), c.req.valid("param").id, c.req.valid("json")), 200),
    )
    .delete("/:id", validate("param", IdParam), async (c) => {
      const { id } = c.req.valid("param");
      const { name } = await svc.deleteTag(scopeOf(deps, c), id);
      await deps.audit({ action: "tag.delete", ...requestMeta(c, deps.trustProxy), details: { id, name } });
      return c.body(null, 204);
    })
    .post("/:id/merge", validate("param", IdParam), validate("json", MergeTagBody), async (c) => {
      const { id } = c.req.valid("param");
      const { intoTagId } = c.req.valid("json");
      const tag = await svc.mergeTag(scopeOf(deps, c), id, intoTagId);
      await deps.audit({ action: "tag.merge", ...requestMeta(c, deps.trustProxy), details: { id, intoTagId } });
      return c.json(tag, 200);
    });

export const fieldsRoutes = (deps: AppDeps) =>
  new Hono<AppEnv>()
    .get("/", async (c) => c.json({ fields: await svc.listFields(scopeOf(deps, c)) } satisfies FieldsResponse, 200))
    .post("/", validate("json", CreateFieldBody), async (c) => c.json(await svc.createField(scopeOf(deps, c), c.req.valid("json")), 201))
    .patch("/:id", validate("param", IdParam), validate("json", UpdateFieldBody), async (c) =>
      c.json(await svc.updateField(scopeOf(deps, c), c.req.valid("param").id, c.req.valid("json")), 200),
    )
    .delete("/:id", validate("param", IdParam), async (c) => {
      const { id } = c.req.valid("param");
      const { key } = await svc.deleteField(scopeOf(deps, c), id);
      await deps.audit({ action: "field.delete", ...requestMeta(c, deps.trustProxy), details: { id, key } });
      return c.body(null, 204);
    });

export const smartFoldersRoutes = (deps: AppDeps) =>
  new Hono<AppEnv>()
    .get("/", async (c) => c.json({ smartFolders: await svc.listSmartFolders(scopeOf(deps, c)) } satisfies SmartFoldersResponse, 200))
    .post("/", validate("json", CreateSmartFolderBody), async (c) => c.json(await svc.createSmartFolder(scopeOf(deps, c), c.req.valid("json")), 201))
    .patch("/:id", validate("param", IdParam), validate("json", UpdateSmartFolderBody), async (c) =>
      c.json(await svc.updateSmartFolder(scopeOf(deps, c), c.req.valid("param").id, c.req.valid("json")), 200),
    )
    .delete("/:id", validate("param", IdParam), async (c) => {
      await svc.deleteSmartFolder(scopeOf(deps, c), c.req.valid("param").id);
      return c.body(null, 204);
    });

export const statsRoutes = (deps: AppDeps) => new Hono<AppEnv>().get("/", async (c) => c.json(await getStats(scopeOf(deps, c)), 200));
