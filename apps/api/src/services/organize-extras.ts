// Stop terms, topic clusters and the review of automatic filing. All scoped to one library.
import {
  folders,
  itemFolderRejections,
  itemFolders,
  items,
  itemTagRejections,
  itemTags,
  stopTerms,
  tags,
} from "@magpie/db";
import {
  AUTO_FILED_WINDOW_DAYS,
  type AutoFiledActionBody,
  type AutoFiledEntry,
  type AutoFiledResponse,
  type StopTermsResponse,
  type TopicsQuery,
  type TopicsResponse,
} from "@magpie/shared/api";
import { canonicalKeyword } from "@magpie/shared/text";
import { clusterTopics } from "@magpie/shared/topics";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import type { ServiceDeps } from "../deps.ts";
import { ApiError } from "../http/errors.ts";

// ── stop terms ──────────────────────────────────────────────────────────

export async function listStopTerms(deps: ServiceDeps): Promise<StopTermsResponse> {
  const rows = await deps.db.select({ term: stopTerms.term }).from(stopTerms).where(eq(stopTerms.userId, deps.userId)).orderBy(asc(stopTerms.term));
  return { terms: rows.map((r) => r.term) };
}

/**
 * Adds a term to the stop list and removes the automatic keywords it matches from this library right away,
 * so the effect is visible without re-running extraction. Manual keywords stay: the person typed those.
 */
export async function addStopTerm(deps: ServiceDeps, raw: string): Promise<StopTermsResponse> {
  const term = canonicalKeyword(raw);
  if (term.length < 2) throw new ApiError(400, "bad_request", "That is not a usable keyword");
  await deps.db.transaction(async (tx) => {
    await tx.insert(stopTerms).values({ userId: deps.userId, term }).onConflictDoNothing();
    await tx.execute(sql`delete from item_keywords k using items i
      where k.item_id = i.id and i.user_id = ${deps.userId}::uuid and k.source in ('hashtag', 'caption')
        and (k.keyword = ${term} or k.keyword like ${`${term} %`} or k.keyword like ${`% ${term}`} or k.keyword like ${`% ${term} %`})`);
  });
  return listStopTerms(deps);
}

export async function removeStopTerm(deps: ServiceDeps, raw: string): Promise<StopTermsResponse> {
  await deps.db.delete(stopTerms).where(and(eq(stopTerms.userId, deps.userId), eq(stopTerms.term, canonicalKeyword(raw))));
  return listStopTerms(deps);
}

// ── topics ──────────────────────────────────────────────────────────────

const MAX_ANALYSED = 3000;

export async function listTopics(deps: ServiceDeps, query: TopicsQuery): Promise<TopicsResponse> {
  const rows = await deps.db
    .select({
      id: items.id,
      embedding: items.embedding,
      keywords: sql<string[]>`array(select k.keyword from item_keywords k where k.item_id = ${items.id} order by k.weight desc, k.keyword limit 8)`,
      filed: sql<boolean>`(exists (select 1 from item_folders f where f.item_id = ${items.id}) or exists (select 1 from item_tags t where t.item_id = ${items.id}))`,
    })
    .from(items)
    .where(and(eq(items.userId, deps.userId), eq(items.fetchStatus, "ready")))
    .orderBy(desc(items.savedAt))
    .limit(MAX_ANALYSED);

  // a changed embedder leaves old vectors of another length behind; cluster the larger group
  const lengths = new Map<number, number>();
  for (const r of rows) if (r.embedding?.length) lengths.set(r.embedding.length, (lengths.get(r.embedding.length) ?? 0) + 1);
  const dims = [...lengths].sort((a, b) => b[1] - a[1])[0]?.[0];
  const usable = rows.filter((r) => r.embedding?.length === dims);
  const filed = new Map(rows.map((r) => [r.id, r.filed]));

  const topics = clusterTopics(
    usable.flatMap((r) => (r.embedding ? [{ id: r.id, embedding: r.embedding, keywords: r.keywords }] : [])),
  )
    .map((t) => ({
      label: t.label,
      keywords: t.keywords,
      size: t.itemIds.length,
      unfiledCount: t.itemIds.filter((id) => filed.get(id) === false).length,
      itemIds: t.itemIds.slice(0, 200),
    }))
    .filter((t) => (query.unfiled ? t.unfiledCount > 0 : true));
  return { topics, analysed: usable.length, total: rows.length };
}

// ── automatic filing, reviewed ──────────────────────────────────────────

const since = () => new Date(Date.now() - AUTO_FILED_WINDOW_DAYS * 24 * 60 * 60 * 1000);

export async function listAutoFiled(deps: ServiceDeps): Promise<AutoFiledResponse> {
  const cutoff = since();
  const [folderRows, tagRows] = await Promise.all([
    deps.db
      .select({ itemId: itemFolders.itemId, id: folders.id, name: folders.name, at: itemFolders.addedAt })
      .from(itemFolders)
      .innerJoin(folders, eq(folders.id, itemFolders.folderId))
      .innerJoin(items, eq(items.id, itemFolders.itemId))
      .where(and(eq(items.userId, deps.userId), eq(itemFolders.assignedBy, "auto"), gt(itemFolders.addedAt, cutoff))),
    deps.db
      .select({ itemId: itemTags.itemId, id: tags.id, name: tags.name, at: itemTags.addedAt })
      .from(itemTags)
      .innerJoin(tags, eq(tags.id, itemTags.tagId))
      .innerJoin(items, eq(items.id, itemTags.itemId))
      .where(and(eq(items.userId, deps.userId), eq(itemTags.assignedBy, "auto"), gt(itemTags.addedAt, cutoff))),
  ]);

  const byItem = new Map<string, { folders: { id: string; name: string }[]; tags: { id: string; name: string }[]; at: Date }>();
  const entry = (itemId: string, at: Date) => {
    const e = byItem.get(itemId) ?? { folders: [], tags: [], at };
    if (at > e.at) e.at = at;
    byItem.set(itemId, e);
    return e;
  };
  for (const r of folderRows) entry(r.itemId, r.at).folders.push({ id: r.id, name: r.name });
  for (const r of tagRows) entry(r.itemId, r.at).tags.push({ id: r.id, name: r.name });

  const ids = [...byItem.keys()];
  if (ids.length === 0) return { entries: [], count: 0 };
  const meta = await deps.db
    .select({
      id: items.id,
      title: items.title,
      thumb: sql<string | null>`(select coalesce(m.thumb_key, case when m.type = 'image' then m.storage_key end) from media m where m.item_id = ${items.id} order by m.position limit 1)`,
    })
    .from(items)
    .where(inArray(items.id, ids));

  const entries: AutoFiledEntry[] = await Promise.all(
    meta.map(async (m) => {
      const e = byItem.get(m.id);
      return {
        itemId: m.id,
        title: m.title,
        thumbUrl: m.thumb ? await deps.store.signedUrl(m.thumb, deps.mediaUrlTtlSeconds) : null,
        folders: e?.folders ?? [],
        tags: e?.tags ?? [],
        filedAt: (e?.at ?? new Date()).toISOString(),
      };
    }),
  );
  entries.sort((a, b) => b.filedAt.localeCompare(a.filedAt));
  return { entries, count: entries.length };
}

/** The pending items among `itemIds` (or all pending ones), restricted to this library. */
async function pendingIds(deps: ServiceDeps, body: AutoFiledActionBody): Promise<string[]> {
  const pending = (await listAutoFiled(deps)).entries.map((e) => e.itemId);
  return body.itemIds ? pending.filter((id) => body.itemIds?.includes(id)) : pending;
}

/** "Keep": the automatic filing becomes the person's own, which the categorizer then learns from. */
export async function keepAutoFiled(deps: ServiceDeps, body: AutoFiledActionBody): Promise<number> {
  const ids = await pendingIds(deps, body);
  if (ids.length === 0) return 0;
  await deps.db.transaction(async (tx) => {
    await tx.update(itemFolders).set({ assignedBy: "manual", confidence: null }).where(and(inArray(itemFolders.itemId, ids), eq(itemFolders.assignedBy, "auto")));
    await tx.update(itemTags).set({ assignedBy: "manual", confidence: null }).where(and(inArray(itemTags.itemId, ids), eq(itemTags.assignedBy, "auto")));
  });
  return ids.length;
}

/** "Undo": the automatic filing is removed and remembered, so it is not proposed again. */
export async function undoAutoFiled(deps: ServiceDeps, body: AutoFiledActionBody): Promise<number> {
  const ids = await pendingIds(deps, body);
  if (ids.length === 0) return 0;
  await deps.db.transaction(async (tx) => {
    const removedFolders = await tx
      .delete(itemFolders)
      .where(and(inArray(itemFolders.itemId, ids), eq(itemFolders.assignedBy, "auto")))
      .returning({ itemId: itemFolders.itemId, folderId: itemFolders.folderId });
    const removedTags = await tx
      .delete(itemTags)
      .where(and(inArray(itemTags.itemId, ids), eq(itemTags.assignedBy, "auto")))
      .returning({ itemId: itemTags.itemId, tagId: itemTags.tagId });
    if (removedFolders.length) await tx.insert(itemFolderRejections).values(removedFolders).onConflictDoNothing();
    if (removedTags.length) await tx.insert(itemTagRejections).values(removedTags).onConflictDoNothing();
  });
  return ids.length;
}
