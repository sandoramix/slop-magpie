import {
  auditLog,
  type Database,
  fieldDefs,
  folders,
  itemFolderSuggestions,
  itemFolders,
  itemKeywords,
  items,
  itemTagSuggestions,
  itemTags,
  media,
  smartFolders,
  tags,
} from "@magpie/db";
import {
  type BulkBody,
  type CreateItemBody,
  type CreateItemResponse,
  customValuesSchema,
  type ItemDetail,
  type ItemFilter,
  type ItemListQuery,
  type ItemListResponse,
  type ItemSummary,
  type SetItemFoldersBody,
  type SetItemTagsBody,
  SmartFolderQuery,
  type SuggestionsBody,
  type UpdateItemBody,
  filterFromListQuery,
} from "@magpie/shared/api";
import { checkPublicUrl } from "@magpie/shared/net";
import { resolveSource } from "@magpie/shared/sources";
import { and, asc, count, desc, eq, inArray, notInArray, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import type { AuditEvent, ServiceDeps } from "../deps.ts";
import { ApiError } from "../http/errors.ts";
import { decodeCursor, encodeCursor } from "./cursor.ts";
import { isUniqueViolation } from "./pg-errors.ts";
import { assertHasRoom } from "./storage.ts";
import { itemConditions } from "./search.ts";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Db = Database | Tx;

const notFound = () => new ApiError(404, "not_found", "Item not found");

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

// ── reading ─────────────────────────────────────────────────────────────

const FirstMedia = z
  .object({ thumb: z.string().nullable(), w: z.number().nullable(), h: z.number().nullable() })
  .nullable();

// in a select list drizzle renders columns unqualified, which would bind to the subquery's own table
const ITEM_ID = sql.raw('"items"."id"');

const summaryColumns = {
  id: items.id,
  title: items.title,
  source: items.source,
  kind: items.kind,
  fetchStatus: items.fetchStatus,
  favorite: items.favorite,
  savedAt: items.savedAt,
  savedAtText: sql<string>`${items.savedAt}::text`,
  workflow: items.workflow,
  availability: items.availability,
  authorHandle: items.authorHandle,
  firstMedia: sql<unknown>`(select json_build_object('thumb', coalesce(m.thumb_key, case when m.type = 'image' then m.storage_key end), 'w', m.width, 'h', m.height) from media m where m.item_id = ${ITEM_ID} order by m.position limit 1)`,
  mediaCount: sql<number>`(select count(*)::int from media m where m.item_id = ${ITEM_ID})`,
  tagIds: sql<string[]>`array(select it.tag_id::text from item_tags it where it.item_id = ${ITEM_ID} order by it.added_at)`,
  suggestionCount: sql<number>`((select count(*) from item_folder_suggestions s where s.item_id = ${ITEM_ID}) + (select count(*) from item_tag_suggestions s where s.item_id = ${ITEM_ID}))::int`,
};

interface SummaryRow {
  id: string;
  title: string | null;
  source: string;
  kind: ItemSummary["kind"];
  fetchStatus: ItemSummary["fetchStatus"];
  favorite: boolean;
  savedAt: Date;
  workflow: ItemSummary["workflow"];
  availability: ItemSummary["availability"];
  authorHandle: string | null;
  firstMedia: unknown;
  mediaCount: number;
  tagIds: string[];
  suggestionCount: number;
}

async function toSummary(deps: ServiceDeps, row: SummaryRow): Promise<ItemSummary> {
  const first = FirstMedia.parse(row.firstMedia);
  return {
    id: row.id,
    title: row.title,
    thumbUrl: first?.thumb ? await deps.store.signedUrl(first.thumb, deps.mediaUrlTtlSeconds) : null,
    source: row.source,
    kind: row.kind,
    fetchStatus: row.fetchStatus,
    favorite: row.favorite,
    savedAt: row.savedAt.toISOString(),
    tagIds: row.tagIds,
    workflow: row.workflow,
    availability: row.availability,
    authorHandle: row.authorHandle,
    aspectRatio: first?.w && first.h ? first.w / first.h : null,
    mediaCount: row.mediaCount,
    suggestionCount: row.suggestionCount,
  };
}

export async function getItem(deps: ServiceDeps, id: string, db: Db = deps.db): Promise<ItemDetail> {
  const [row] = await db
    .select({ ...summaryColumns, item: items })
    .from(items)
    .where(and(eq(items.id, id), eq(items.userId, deps.userId)));
  if (!row) throw notFound();
  const { item } = row;

  const [mediaRows, folderRows, tagRows, keywordRows, folderSugg, tagSugg] = await Promise.all([
    db.select().from(media).where(eq(media.itemId, id)).orderBy(asc(media.position)),
    db
      .select({ id: folders.id, name: folders.name, assignedBy: itemFolders.assignedBy, confidence: itemFolders.confidence })
      .from(itemFolders)
      .innerJoin(folders, eq(folders.id, itemFolders.folderId))
      .where(eq(itemFolders.itemId, id))
      .orderBy(asc(folders.name)),
    db
      .select({ id: tags.id, name: tags.name, color: tags.color, assignedBy: itemTags.assignedBy, confidence: itemTags.confidence })
      .from(itemTags)
      .innerJoin(tags, eq(tags.id, itemTags.tagId))
      .where(eq(itemTags.itemId, id))
      .orderBy(asc(tags.name)),
    db
      .select({ keyword: itemKeywords.keyword, source: itemKeywords.source, weight: itemKeywords.weight })
      .from(itemKeywords)
      .where(eq(itemKeywords.itemId, id))
      .orderBy(desc(itemKeywords.weight), asc(itemKeywords.keyword)),
    db
      .select({ id: folders.id, name: folders.name, confidence: itemFolderSuggestions.confidence })
      .from(itemFolderSuggestions)
      .innerJoin(folders, eq(folders.id, itemFolderSuggestions.folderId))
      .where(eq(itemFolderSuggestions.itemId, id))
      .orderBy(desc(itemFolderSuggestions.confidence)),
    db
      .select({ id: tags.id, name: tags.name, confidence: itemTagSuggestions.confidence })
      .from(itemTagSuggestions)
      .innerJoin(tags, eq(tags.id, itemTagSuggestions.tagId))
      .where(eq(itemTagSuggestions.itemId, id))
      .orderBy(desc(itemTagSuggestions.confidence)),
  ]);

  const ttl = deps.mediaUrlTtlSeconds;
  return {
    ...(await toSummary(deps, row)),
    sourceUrl: item.sourceUrl,
    canonicalUrl: item.canonicalUrl,
    sourceItemId: item.sourceItemId,
    authorName: item.authorName,
    authorUrl: item.authorUrl,
    caption: item.caption,
    notes: item.notes,
    postedAt: iso(item.postedAt),
    fetchError: item.fetchError,
    fetchAttempts: item.fetchAttempts,
    availabilityCheckedAt: iso(item.availabilityCheckedAt),
    rating: item.rating,
    custom: item.custom,
    media: await Promise.all(
      mediaRows.map(async (m) => ({
        id: m.id,
        position: m.position,
        type: m.type,
        url: await deps.store.signedUrl(m.storageKey, ttl),
        thumbUrl: m.thumbKey ? await deps.store.signedUrl(m.thumbKey, ttl) : null,
        mime: m.mime,
        bytes: m.bytes,
        width: m.width,
        height: m.height,
        durationMs: m.durationMs,
      })),
    ),
    folders: folderRows,
    tags: tagRows,
    keywords: keywordRows,
    suggestions: { folders: folderSugg, tags: tagSugg },
  };
}

async function smartFolderFilter(db: Database, userId: string, id: string): Promise<ItemFilter> {
  const [row] = await db
    .select({ query: smartFolders.query })
    .from(smartFolders)
    .where(and(eq(smartFolders.id, id), eq(smartFolders.userId, userId)));
  if (!row) throw new ApiError(404, "not_found", "Smart folder not found");
  const { sort: _sort, ...filter } = SmartFolderQuery.catch({}).parse(row.query);
  return filter;
}

export async function listItems(deps: ServiceDeps, query: ItemListQuery): Promise<ItemListResponse> {
  const { db } = deps;
  const filters = [filterFromListQuery(query)];
  if (query.smartFolderId) filters.push(await smartFolderFilter(db, deps.userId, query.smartFolderId));
  const { where, rank } = await itemConditions(db, deps.userId, filters);
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  const sort = query.sort === "relevance" && !rank ? "saved_desc" : query.sort;
  const limit = query.limit;

  const conditions: (SQL | undefined)[] = [where];
  let orderBy: SQL[];
  let offset = 0;
  if (sort === "saved_desc" || sort === "saved_asc") {
    const dir = sort === "saved_desc" ? sql`<` : sql`>`;
    if (cursor?.k === "ks") conditions.push(sql`(${items.savedAt}, ${items.id}) ${dir} (${cursor.s}::timestamptz, ${cursor.i}::uuid)`);
    orderBy = sort === "saved_desc" ? [desc(items.savedAt), desc(items.id)] : [asc(items.savedAt), asc(items.id)];
  } else {
    if (cursor?.k === "off") offset = cursor.o;
    orderBy =
      sort === "relevance" && rank
        ? [sql`${rank} desc`, desc(items.savedAt), desc(items.id)]
        : [sql`${items.postedAt} desc nulls last`, desc(items.savedAt), desc(items.id)];
  }

  const rows = await db
    .select(summaryColumns)
    .from(items)
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(limit + 1)
    .offset(offset);

  const page = rows.slice(0, limit);
  const last = page.at(-1);
  let nextCursor: string | null = null;
  if (rows.length > limit && last) {
    nextCursor =
      sort === "saved_desc" || sort === "saved_asc"
        ? encodeCursor({ k: "ks", s: last.savedAtText, i: last.id })
        : encodeCursor({ k: "off", o: offset + limit });
  }
  return { items: await Promise.all(page.map((r) => toSummary(deps, r))), nextCursor };
}

// ── writing ─────────────────────────────────────────────────────────────

async function assertExist(db: Db, userId: string, table: typeof folders | typeof tags, ids: readonly string[], what: string) {
  if (ids.length === 0) return;
  const unique = [...new Set(ids)];
  const [row] = await db.select({ n: count() }).from(table).where(and(eq(table.userId, userId), inArray(table.id, unique)));
  if ((row?.n ?? 0) !== unique.length) throw new ApiError(400, "bad_request", `Unknown ${what} id`);
}

async function findDuplicate(db: Db, userId: string, canonicalUrl: string, source: string, sourceItemId: string | null) {
  const match = sourceItemId
    ? or(eq(items.canonicalUrl, canonicalUrl), and(eq(items.source, source), eq(items.sourceItemId, sourceItemId)))
    : eq(items.canonicalUrl, canonicalUrl);
  const [row] = await db.select({ id: items.id }).from(items).where(and(eq(items.userId, userId), match)).limit(1);
  return row?.id ?? null;
}

async function linkFoldersAndTags(db: Db, itemId: string, folderIds: readonly string[], tagIds: readonly string[]) {
  if (folderIds.length) {
    await db
      .insert(itemFolders)
      .values([...new Set(folderIds)].map((folderId) => ({ itemId, folderId })))
      .onConflictDoNothing();
    await db.delete(itemFolderSuggestions).where(and(eq(itemFolderSuggestions.itemId, itemId), inArray(itemFolderSuggestions.folderId, [...folderIds])));
  }
  if (tagIds.length) {
    await db
      .insert(itemTags)
      .values([...new Set(tagIds)].map((tagId) => ({ itemId, tagId })))
      .onConflictDoNothing();
    await db.delete(itemTagSuggestions).where(and(eq(itemTagSuggestions.itemId, itemId), inArray(itemTagSuggestions.tagId, [...tagIds])));
  }
}

export async function createItem(deps: ServiceDeps, body: CreateItemBody): Promise<{ status: 200 | 202; body: CreateItemResponse }> {
  const check = checkPublicUrl(body.url);
  if (!check.ok) throw new ApiError(422, "unsupported_url", `URL not accepted (${check.reason})`);
  await assertHasRoom(deps.db, deps.userId);
  const resolved = resolveSource(check.url);
  const folderIds = body.folderIds ?? [];
  const tagIds = body.tagIds ?? [];

  const result = await deps.db.transaction(async (tx) => {
    await assertExist(tx, deps.userId, folders, folderIds, "folder");
    await assertExist(tx, deps.userId, tags, tagIds, "tag");
    const existing = await findDuplicate(tx, deps.userId, resolved.canonicalUrl, resolved.source.id, resolved.sourceItemId);
    if (existing) {
      // sharing again with a folder/tag picked files the existing item there
      await linkFoldersAndTags(tx, existing, folderIds, tagIds);
      return { id: existing, created: false };
    }
    const [row] = await tx
      .insert(items)
      .values({
        userId: deps.userId,
        sourceUrl: body.url,
        canonicalUrl: resolved.canonicalUrl,
        source: resolved.source.id,
        sourceItemId: resolved.sourceItemId,
        notes: body.notes ?? null,
      })
      .returning({ id: items.id });
    if (!row) throw new Error("insert returned no row");
    await linkFoldersAndTags(tx, row.id, folderIds, tagIds);
    return { id: row.id, created: true };
  }).catch(async (error: unknown) => {
    // lost a race with a concurrent save of the same URL
    if (!isUniqueViolation(error)) throw error;
    const id = await findDuplicate(deps.db, deps.userId, resolved.canonicalUrl, resolved.source.id, resolved.sourceItemId);
    if (!id) throw error;
    return { id, created: false };
  });

  if (result.created) await enqueueFetch(deps, result.id);
  return {
    status: result.created ? 202 : 200,
    body: { item: await getItem(deps, result.id), duplicate: !result.created },
  };
}

async function enqueueFetch(deps: ServiceDeps, itemId: string) {
  try {
    await deps.jobs.sendItemJob("fetch", { itemId });
  } catch (error) {
    // the worker's sweep re-enqueues pending items, so the save itself still succeeds
    deps.log.error({ err: error, itemId }, "enqueue fetch failed");
  }
}

export async function updateItem(deps: ServiceDeps, id: string, body: UpdateItemBody): Promise<ItemDetail> {
  await deps.db.transaction(async (tx) => {
    const [current] = await tx
      .select({ custom: items.custom })
      .from(items)
      .where(and(eq(items.id, id), eq(items.userId, deps.userId)))
      .for("update");
    if (!current) throw notFound();

    const patch: Partial<typeof items.$inferInsert> = {};
    if (body.title !== undefined) patch.title = body.title === "" ? null : body.title;
    if (body.notes !== undefined) patch.notes = body.notes === "" ? null : body.notes;
    if (body.workflow !== undefined) patch.workflow = body.workflow;
    if (body.favorite !== undefined) patch.favorite = body.favorite;
    if (body.rating !== undefined) patch.rating = body.rating;
    if (body.custom !== undefined) {
      const defs = await tx.select({ key: fieldDefs.key, type: fieldDefs.type, options: fieldDefs.options }).from(fieldDefs).where(eq(fieldDefs.userId, deps.userId));
      const parsed = customValuesSchema(defs).safeParse(body.custom);
      if (!parsed.success) {
        throw new ApiError(400, "bad_request", parsed.error.issues.map((i) => `custom.${i.path.join(".")}: ${i.message}`).join("; "));
      }
      const merged = { ...current.custom, ...(parsed.data as Record<string, unknown>) };
      patch.custom = Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== null && v !== undefined));
    }
    if (Object.keys(patch).length) await tx.update(items).set(patch).where(eq(items.id, id));
  });
  return getItem(deps, id);
}

export async function deleteItems(deps: ServiceDeps, ids: readonly string[], audit: Omit<AuditEvent, "action" | "details">, action: string) {
  const deleted = await deps.db.transaction(async (tx) => {
    const rows = await tx
      .delete(items)
      .where(and(eq(items.userId, deps.userId), inArray(items.id, [...ids])))
      .returning({ id: items.id, url: items.canonicalUrl });
    if (rows.length) {
      await tx.insert(auditLog).values({ ...audit, action, details: { count: rows.length, ids: rows.map((r) => r.id).slice(0, 100) } });
    }
    return rows;
  });
  for (const row of deleted) {
    try {
      await deps.jobs.sendItemJob("blobDelete", { itemId: row.id });
    } catch (error) {
      deps.log.error({ err: error, itemId: row.id }, "enqueue blob-delete failed; blobs left behind");
    }
  }
  return deleted.length;
}

export async function refetchItems(deps: ServiceDeps, ids: readonly string[]): Promise<number> {
  const rows = await deps.db
    .update(items)
    .set({ fetchStatus: "pending", fetchError: null, fetchAttempts: 0 })
    .where(and(eq(items.userId, deps.userId), inArray(items.id, [...ids])))
    .returning({ id: items.id });
  for (const row of rows) await enqueueFetch(deps, row.id);
  return rows.length;
}

export async function setItemFolders(deps: ServiceDeps, id: string, body: SetItemFoldersBody): Promise<ItemDetail> {
  await deps.db.transaction(async (tx) => {
    await assertItem(tx, deps.userId, id);
    await assertExist(tx, deps.userId, folders, body.folderIds, "folder");
    const keep = body.folderIds.length ? notInArray(itemFolders.folderId, body.folderIds) : undefined;
    await tx.delete(itemFolders).where(and(eq(itemFolders.itemId, id), keep));
    await linkFoldersAndTags(tx, id, body.folderIds, []);
  });
  return getItem(deps, id);
}

export async function setItemTags(deps: ServiceDeps, id: string, body: SetItemTagsBody): Promise<ItemDetail> {
  await deps.db.transaction(async (tx) => {
    await assertItem(tx, deps.userId, id);
    await assertExist(tx, deps.userId, tags, body.tagIds, "tag");
    const keep = body.tagIds.length ? notInArray(itemTags.tagId, body.tagIds) : undefined;
    await tx.delete(itemTags).where(and(eq(itemTags.itemId, id), keep));
    await linkFoldersAndTags(tx, id, [], body.tagIds);
  });
  return getItem(deps, id);
}

async function assertItem(db: Db, userId: string, id: string) {
  const [row] = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.id, id), eq(items.userId, userId)));
  if (!row) throw notFound();
}

export function normalizeKeyword(keyword: string): string {
  return keyword.trim().replace(/^#+/, "").toLowerCase().replace(/\s+/g, " ");
}

export async function addKeyword(deps: ServiceDeps, id: string, keyword: string): Promise<ItemDetail> {
  const normalized = normalizeKeyword(keyword);
  if (!normalized) throw new ApiError(400, "bad_request", "Empty keyword");
  await assertItem(deps.db, deps.userId, id);
  await deps.db.insert(itemKeywords).values({ itemId: id, keyword: normalized, source: "manual", weight: 1 }).onConflictDoNothing();
  return getItem(deps, id);
}

export async function deleteKeyword(deps: ServiceDeps, id: string, keyword: string, source: string | undefined): Promise<ItemDetail> {
  await assertItem(deps.db, deps.userId, id);
  const bySource = source ? sql`${itemKeywords.source} = ${source}` : undefined;
  await deps.db.delete(itemKeywords).where(and(eq(itemKeywords.itemId, id), eq(itemKeywords.keyword, normalizeKeyword(keyword)), bySource));
  return getItem(deps, id);
}

/** Accepted suggestions become manual assignments (which the categorizer then learns from). */
/** Both lists omitted = all suggestions; one list given = only those. */
function suggestionScope(body: SuggestionsBody): { folderIds: string[] | undefined; tagIds: string[] | undefined } {
  const all = body.folderIds === undefined && body.tagIds === undefined;
  return { folderIds: all ? undefined : (body.folderIds ?? []), tagIds: all ? undefined : (body.tagIds ?? []) };
}

export async function acceptSuggestions(deps: ServiceDeps, ids: readonly string[], scope: SuggestionsBody, db: Db = deps.db): Promise<void> {
  const body = suggestionScope(scope);
  for (const itemId of ids) {
    const folderRows = await db
      .delete(itemFolderSuggestions)
      .where(and(eq(itemFolderSuggestions.itemId, itemId), body.folderIds ? inArray(itemFolderSuggestions.folderId, body.folderIds) : undefined))
      .returning({ folderId: itemFolderSuggestions.folderId });
    const tagRows = await db
      .delete(itemTagSuggestions)
      .where(and(eq(itemTagSuggestions.itemId, itemId), body.tagIds ? inArray(itemTagSuggestions.tagId, body.tagIds) : undefined))
      .returning({ tagId: itemTagSuggestions.tagId });
    await linkFoldersAndTags(
      db,
      itemId,
      folderRows.map((r) => r.folderId),
      tagRows.map((r) => r.tagId),
    );
  }
}

export async function dismissSuggestions(deps: ServiceDeps, id: string, scope: SuggestionsBody): Promise<void> {
  const body = suggestionScope(scope);
  await deps.db
    .delete(itemFolderSuggestions)
    .where(and(eq(itemFolderSuggestions.itemId, id), body.folderIds ? inArray(itemFolderSuggestions.folderId, body.folderIds) : undefined));
  await deps.db
    .delete(itemTagSuggestions)
    .where(and(eq(itemTagSuggestions.itemId, id), body.tagIds ? inArray(itemTagSuggestions.tagId, body.tagIds) : undefined));
}

export async function suggestionsAction(
  deps: ServiceDeps,
  id: string,
  body: SuggestionsBody,
  action: "accept" | "dismiss",
): Promise<ItemDetail> {
  await assertItem(deps.db, deps.userId, id);
  if (action === "accept") await deps.db.transaction((tx) => acceptSuggestions(deps, [id], body, tx));
  else await dismissSuggestions(deps, id, body);
  return getItem(deps, id);
}

export async function bulk(deps: ServiceDeps, body: BulkBody, audit: Omit<AuditEvent, "action" | "details">): Promise<number> {
  const ids = [...new Set(body.ids)];
  const { db } = deps;
  const existing = (await db.select({ id: items.id }).from(items).where(and(eq(items.userId, deps.userId), inArray(items.id, ids)))).map((r) => r.id);
  if (existing.length === 0) return 0;

  switch (body.op) {
    case "delete":
      return deleteItems(deps, existing, audit, "item.bulk_delete");
    case "refetch":
      return refetchItems(deps, existing);
    case "setWorkflow":
      await db.update(items).set({ workflow: body.workflow }).where(inArray(items.id, existing));
      break;
    case "setFavorite":
      await db.update(items).set({ favorite: body.favorite }).where(inArray(items.id, existing));
      break;
    case "addFolder":
      await db.transaction(async (tx) => {
        await assertExist(tx, deps.userId, folders, [body.folderId], "folder");
        for (const id of existing) await linkFoldersAndTags(tx, id, [body.folderId], []);
      });
      break;
    case "removeFolder":
      await db.delete(itemFolders).where(and(inArray(itemFolders.itemId, existing), eq(itemFolders.folderId, body.folderId)));
      break;
    case "addTag":
      await db.transaction(async (tx) => {
        await assertExist(tx, deps.userId, tags, [body.tagId], "tag");
        for (const id of existing) await linkFoldersAndTags(tx, id, [], [body.tagId]);
      });
      break;
    case "removeTag":
      await db.delete(itemTags).where(and(inArray(itemTags.itemId, existing), eq(itemTags.tagId, body.tagId)));
      break;
    case "acceptSuggestions":
      await db.transaction((tx) => acceptSuggestions(deps, existing, {}, tx));
      break;
  }
  await db.insert(auditLog).values({ ...audit, action: "item.bulk", details: { op: body.op, count: existing.length } });
  return existing.length;
}
