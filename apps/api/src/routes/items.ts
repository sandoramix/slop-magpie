import {
  AddKeywordBody,
  BulkBody,
  type BulkResponse,
  CreateItemBody,
  DeleteKeywordQuery,
  IdParam,
  ItemListQuery,
  SetItemFoldersBody,
  SetItemTagsBody,
  SuggestionsBody,
  UpdateItemBody,
} from "@magpie/shared/api";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../deps.ts";
import { errorResponse } from "../http/errors.ts";
import { requestMeta } from "../http/request-meta.ts";
import { validate } from "../http/validate.ts";
import { createFailureLimiter } from "../middleware/rate-limit.ts";
import * as svc from "../services/items.ts";

const KeywordParam = IdParam.extend({ keyword: z.string().min(1).max(100) });

export const itemsRoutes = (deps: AppDeps) => {
  // reused as a plain fixed-window counter: every save counts
  const saves = createFailureLimiter({ max: deps.createItemLimit ?? 60, windowMs: 60_000 });

  return new Hono()
    .get("/", validate("query", ItemListQuery), async (c) => c.json(await svc.listItems(deps, c.req.valid("query")), 200))
    .post("/", validate("json", CreateItemBody), async (c) => {
      if (saves.isBlocked("all")) return errorResponse(c, 429, "rate_limited", "Too many saves, try again in a minute");
      saves.recordFailure("all");
      const { status, body } = await svc.createItem(deps, c.req.valid("json"));
      return c.json(body, status);
    })
    .post("/bulk", validate("json", BulkBody), async (c) => {
      const affected = await svc.bulk(deps, c.req.valid("json"), requestMeta(c, deps.trustProxy));
      return c.json({ affected } satisfies BulkResponse, 200);
    })
    .get("/:id", validate("param", IdParam), async (c) => c.json(await svc.getItem(deps, c.req.valid("param").id), 200))
    .patch("/:id", validate("param", IdParam), validate("json", UpdateItemBody), async (c) =>
      c.json(await svc.updateItem(deps, c.req.valid("param").id, c.req.valid("json")), 200),
    )
    .delete("/:id", validate("param", IdParam), async (c) => {
      const n = await svc.deleteItems(deps, [c.req.valid("param").id], requestMeta(c, deps.trustProxy), "item.delete");
      if (n === 0) return errorResponse(c, 404, "not_found", "Item not found");
      return c.body(null, 204);
    })
    .post("/:id/refetch", validate("param", IdParam), async (c) => {
      const { id } = c.req.valid("param");
      if ((await svc.refetchItems(deps, [id])) === 0) return errorResponse(c, 404, "not_found", "Item not found");
      return c.json(await svc.getItem(deps, id), 202);
    })
    .put("/:id/folders", validate("param", IdParam), validate("json", SetItemFoldersBody), async (c) =>
      c.json(await svc.setItemFolders(deps, c.req.valid("param").id, c.req.valid("json")), 200),
    )
    .put("/:id/tags", validate("param", IdParam), validate("json", SetItemTagsBody), async (c) =>
      c.json(await svc.setItemTags(deps, c.req.valid("param").id, c.req.valid("json")), 200),
    )
    .post("/:id/keywords", validate("param", IdParam), validate("json", AddKeywordBody), async (c) =>
      c.json(await svc.addKeyword(deps, c.req.valid("param").id, c.req.valid("json").keyword), 200),
    )
    .delete("/:id/keywords/:keyword", validate("param", KeywordParam), validate("query", DeleteKeywordQuery), async (c) => {
      const { id, keyword } = c.req.valid("param");
      return c.json(await svc.deleteKeyword(deps, id, keyword, c.req.valid("query").source), 200);
    })
    .post("/:id/suggestions/accept", validate("param", IdParam), validate("json", SuggestionsBody), async (c) =>
      c.json(await svc.suggestionsAction(deps, c.req.valid("param").id, c.req.valid("json"), "accept"), 200),
    )
    .post("/:id/suggestions/dismiss", validate("param", IdParam), validate("json", SuggestionsBody), async (c) =>
      c.json(await svc.suggestionsAction(deps, c.req.valid("param").id, c.req.valid("json"), "dismiss"), 200),
    );
};
