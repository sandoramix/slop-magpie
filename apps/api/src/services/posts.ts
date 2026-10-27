// Public items ("posts"), saves and likes. Rules in docs/social.md: only the owner changes an item, a
// save is a bookmark, and the owner's delete or un-publish removes every save, like and verdict.
import {
  type Database,
  folders,
  itemFeedback,
  itemLikes,
  itemSaves,
  items,
  itemKeywords,
  itemTried,
  media,
  saveFolders,
  saveTags,
  tags,
  users,
} from "@magpie/db";
import {
  type ExploreQuery,
  type FeedbackReason,
  type FeedbackSummary,
  type FeedQuery,
  type PostDetail,
  type PostListResponse,
  type PostSummary,
  type SaveListQuery,
  type SaveListResponse,
  type SaveSummary,
  type UpdateSaveBody,
  type Visibility,
} from "@magpie/shared/api";
import { and, asc, desc, eq, inArray, isNull, ne, or, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { ServiceDeps } from "../deps.ts";
import { ApiError } from "../http/errors.ts";
import { decodeCursor, encodeCursor } from "./cursor.ts";
import { notifyMany } from "./notifications.ts";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Db = Database | Tx;

const notFound = () => new ApiError(404, "not_found", "Post not found");

// raw references: inside correlated subqueries drizzle would qualify or drop the table name unpredictably
const ITEM_ID = sql.raw('"items"."id"');
const ITEM_OWNER = sql.raw('"items"."user_id"');

/** Public, finished, not moderated, owner active, and no block between the viewer and the owner. */
export const visibleTo = (viewerId: string): SQL =>
  and(
    eq(items.visibility, "public"),
    eq(items.fetchStatus, "ready"),
    isNull(items.hiddenAt),
    sql`not exists (select 1 from users u where u.id = ${ITEM_OWNER} and u.suspended_at is not null)`,
    sql`not exists (select 1 from blocks b where (b.blocker_id = ${viewerId}::uuid and b.blocked_id = ${ITEM_OWNER}) or (b.blocker_id = ${ITEM_OWNER} and b.blocked_id = ${viewerId}::uuid))`,
  ) as SQL;

const FirstMedia = z.object({ thumb: z.string().nullable(), w: z.number().nullable(), h: z.number().nullable() }).nullable();
const FeedbackAgg = z.object({ total: z.number(), worked: z.number(), meh: z.number(), failed: z.number() });

const postColumns = (viewerId: string) => ({
  id: items.id,
  title: items.title,
  source: items.source,
  kind: items.kind,
  ownerId: users.id,
  ownerName: users.name,
  ownerDisplayName: users.displayName,
  publishedAt: items.publishedAt,
  publishedAtText: sql<string | null>`${items.publishedAt}::text`,
  firstMedia: sql<unknown>`(select json_build_object('thumb', coalesce(m.thumb_key, case when m.type = 'image' then m.storage_key end), 'w', m.width, 'h', m.height) from media m where m.item_id = ${ITEM_ID} order by m.position limit 1)`,
  mediaCount: sql<number>`(select count(*)::int from media m where m.item_id = ${ITEM_ID})`,
  likeCount: sql<number>`(select count(*)::int from item_likes l where l.item_id = ${ITEM_ID})`,
  saveCount: sql<number>`(select count(*)::int from item_saves s where s.item_id = ${ITEM_ID})`,
  feedback: sql<unknown>`(select json_build_object('total', count(*)::int, 'worked', (count(*) filter (where f.verdict = 'worked'))::int, 'meh', (count(*) filter (where f.verdict = 'meh'))::int, 'failed', (count(*) filter (where f.verdict = 'failed'))::int) from item_feedback f where f.item_id = ${ITEM_ID})`,
  likedByMe: sql<boolean>`exists (select 1 from item_likes l where l.item_id = ${ITEM_ID} and l.user_id = ${viewerId}::uuid)`,
  savedByMe: sql<boolean>`exists (select 1 from item_saves s where s.item_id = ${ITEM_ID} and s.user_id = ${viewerId}::uuid)`,
});

interface PostRow {
  id: string;
  title: string | null;
  source: string;
  kind: PostSummary["kind"];
  ownerId: string;
  ownerName: string;
  ownerDisplayName: string | null;
  publishedAt: Date | null;
  firstMedia: unknown;
  mediaCount: number;
  likeCount: number;
  saveCount: number;
  feedback: unknown;
  likedByMe: boolean;
  savedByMe: boolean;
}

async function toPost(deps: ServiceDeps, row: PostRow): Promise<PostSummary> {
  const first = FirstMedia.parse(row.firstMedia);
  const agg = FeedbackAgg.parse(row.feedback);
  return {
    id: row.id,
    title: row.title,
    thumbUrl: first?.thumb ? await deps.store.signedUrl(first.thumb, deps.mediaUrlTtlSeconds) : null,
    source: row.source,
    kind: row.kind,
    aspectRatio: first?.w && first.h ? first.w / first.h : null,
    mediaCount: row.mediaCount,
    owner: { id: row.ownerId, name: row.ownerName, displayName: row.ownerDisplayName },
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    likeCount: row.likeCount,
    saveCount: row.saveCount,
    feedback: { ...agg, reasons: {} },
    likedByMe: row.likedByMe,
    savedByMe: row.savedByMe,
    mine: row.ownerId === deps.userId,
  };
}

const selectPosts = (deps: ServiceDeps) => deps.db.select(postColumns(deps.userId)).from(items).innerJoin(users, eq(users.id, items.userId));

/** Posts newest-published first, keyset paged. */
async function publishedPage(deps: ServiceDeps, where: SQL | undefined, cursorText: string | undefined, limit: number): Promise<PostListResponse> {
  const cursor = cursorText ? decodeCursor(cursorText) : null;
  const rows = await selectPosts(deps)
    .where(
      and(
        where,
        cursor?.k === "ks" ? sql`(${items.publishedAt}, ${items.id}) < (${cursor.s}::timestamptz, ${cursor.i}::uuid)` : undefined,
      ),
    )
    .orderBy(desc(items.publishedAt), desc(items.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    posts: await Promise.all(page.map((r) => toPost(deps, r))),
    nextCursor: rows.length > limit && last?.publishedAtText ? encodeCursor({ k: "ks", s: last.publishedAtText, i: last.id }) : null,
  };
}

export const feed = (deps: ServiceDeps, query: FeedQuery) =>
  publishedPage(
    deps,
    and(visibleTo(deps.userId), sql`${ITEM_OWNER} in (select followee_id from follows where follower_id = ${deps.userId}::uuid)`),
    query.cursor,
    query.limit,
  );

export async function explore(deps: ServiceDeps, query: ExploreQuery): Promise<PostListResponse> {
  const term = query.q ? `%${query.q.replace(/[\\%_]/g, "\\$&")}%` : null;
  const where = and(
    visibleTo(deps.userId),
    ne(items.userId, deps.userId),
    query.source ? eq(items.source, query.source) : undefined,
    term ? or(sql`${items.title} ilike ${term}`, sql`${items.caption} ilike ${term}`, sql`${items.authorHandle} ilike ${term}`) : undefined,
  );
  if (query.sort === "recent") return publishedPage(deps, where, query.cursor, query.limit);

  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  const offset = cursor?.k === "off" ? cursor.o : 0;
  // a save says more than a like, and people who tried it vouch more than anyone: worked +3, didn't work -2
  const score = sql`(
    (select count(*) from item_likes l where l.item_id = ${ITEM_ID})
    + 2 * (select count(*) from item_saves s where s.item_id = ${ITEM_ID})
    + 3 * (select count(*) from item_feedback f where f.item_id = ${ITEM_ID} and f.verdict = 'worked')
    - 2 * (select count(*) from item_feedback f where f.item_id = ${ITEM_ID} and f.verdict = 'failed'))`;
  const rows = await selectPosts(deps)
    .where(where)
    .orderBy(desc(score), desc(items.publishedAt), desc(items.id))
    .limit(query.limit + 1)
    .offset(offset);
  const page = rows.slice(0, query.limit);
  return {
    posts: await Promise.all(page.map((r) => toPost(deps, r))),
    nextCursor: rows.length > query.limit ? encodeCursor({ k: "off", o: offset + query.limit }) : null,
  };
}

/** Cards for these ids in the given order; ones the viewer may not see are left out. */
export async function postsByIds(deps: ServiceDeps, ids: readonly string[]): Promise<PostSummary[]> {
  if (ids.length === 0) return [];
  const rows = await selectPosts(deps).where(and(inArray(items.id, [...ids]), or(eq(items.userId, deps.userId), visibleTo(deps.userId))));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.flatMap((id) => byId.get(id) ?? []);
  return Promise.all(ordered.map((r) => toPost(deps, r)));
}

/** Other people's visible posts that share keywords with this one, best match first. */
export async function similarPosts(deps: ServiceDeps, id: string): Promise<PostSummary[]> {
  await assertVisible(deps.db, deps.userId, id);
  const a = alias(itemKeywords, "a");
  const o = alias(itemKeywords, "o");
  const score = sql`sum(least(${a.weight}, ${o.weight}))`;
  const rows = await deps.db
    .select({ id: o.itemId })
    .from(a)
    .innerJoin(o, and(eq(o.keyword, a.keyword), ne(o.itemId, a.itemId)))
    .innerJoin(items, eq(items.id, o.itemId))
    .where(and(eq(a.itemId, id), ne(items.userId, deps.userId), visibleTo(deps.userId)))
    .groupBy(o.itemId)
    .having(sql`${score} >= 1`)
    .orderBy(desc(score))
    .limit(12);
  return postsByIds(deps, rows.map((r) => r.id));
}

/** One account's public posts. The caller decides whether the account may be seen. */
export const postsOf = (deps: ServiceDeps, ownerId: string, cursor: string | undefined, limit: number) =>
  publishedPage(deps, and(visibleTo(deps.userId), eq(items.userId, ownerId)), cursor, limit);

// ── one post ────────────────────────────────────────────────────────────

/** A post the viewer may see: public and visible, or their own (private included). */
async function loadPost(deps: ServiceDeps, id: string): Promise<PostRow> {
  const [row] = await selectPosts(deps).where(and(eq(items.id, id), or(eq(items.userId, deps.userId), visibleTo(deps.userId))));
  if (!row) throw notFound();
  return row;
}

export async function assertVisible(db: Db, viewerId: string, id: string): Promise<{ ownerId: string; title: string | null }> {
  const [row] = await db
    .select({ ownerId: items.userId, title: items.title })
    .from(items)
    .where(and(eq(items.id, id), or(eq(items.userId, viewerId), visibleTo(viewerId))));
  if (!row) throw notFound();
  return row;
}

export async function getPost(deps: ServiceDeps, id: string): Promise<PostDetail> {
  const row = await loadPost(deps, id);
  const [item] = await deps.db.select().from(items).where(eq(items.id, id));
  if (!item) throw notFound();
  const mine = row.ownerId === deps.userId;

  const [mediaRows, myFeedback, tried, save, reasonRows] = await Promise.all([
    deps.db.select().from(media).where(eq(media.itemId, id)).orderBy(asc(media.position)),
    deps.db
      .select({ verdict: itemFeedback.verdict, reasons: itemFeedback.reasons, updatedAt: itemFeedback.updatedAt })
      .from(itemFeedback)
      .where(and(eq(itemFeedback.itemId, id), eq(itemFeedback.userId, deps.userId))),
    deps.db
      .select({ at: itemTried.triedAt })
      .from(itemTried)
      .where(and(eq(itemTried.itemId, id), eq(itemTried.userId, deps.userId))),
    deps.db
      .select({
        id: itemSaves.id,
        note: itemSaves.note,
        folderIds: sql<string[]>`array(select sf.folder_id::text from save_folders sf where sf.save_id = ${itemSaves.id})`,
        tagIds: sql<string[]>`array(select st.tag_id::text from save_tags st where st.save_id = ${itemSaves.id})`,
      })
      .from(itemSaves)
      .where(and(eq(itemSaves.itemId, id), eq(itemSaves.userId, deps.userId))),
    mine
      ? deps.db
          .select({ reason: sql<string>`r`, n: sql<number>`count(*)::int` })
          .from(sql`item_feedback f, unnest(f.reasons) as r`)
          .where(sql`f.item_id = ${id}::uuid`)
          .groupBy(sql`r`)
      : Promise.resolve([]),
  ]);

  const summary = await toPost(deps, row);
  const feedback: FeedbackSummary = { ...summary.feedback, reasons: Object.fromEntries(reasonRows.map((r) => [r.reason, r.n])) };
  const ttl = deps.mediaUrlTtlSeconds;
  const mine0 = myFeedback[0];
  return {
    ...summary,
    feedback,
    canonicalUrl: item.canonicalUrl,
    authorHandle: item.authorHandle,
    authorName: item.authorName,
    authorUrl: item.authorUrl,
    caption: item.caption,
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
    myFeedback: mine0 ? { verdict: mine0.verdict, reasons: mine0.reasons as FeedbackReason[], updatedAt: mine0.updatedAt.toISOString() } : null,
    triedByMe: tried.length > 0,
    save: save[0] ?? null,
  };
}

// ── likes ───────────────────────────────────────────────────────────────

export async function setLike(deps: ServiceDeps, id: string, liked: boolean): Promise<void> {
  await assertVisible(deps.db, deps.userId, id);
  if (liked) await deps.db.insert(itemLikes).values({ userId: deps.userId, itemId: id }).onConflictDoNothing();
  else await deps.db.delete(itemLikes).where(and(eq(itemLikes.userId, deps.userId), eq(itemLikes.itemId, id)));
}

// ── saves ───────────────────────────────────────────────────────────────

async function assertOwned(db: Db, table: typeof folders | typeof tags, userId: string, ids: readonly string[], what: string) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const rows = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.userId, userId), inArray(table.id, unique)));
  if (rows.length !== unique.length) throw new ApiError(400, "bad_request", `Unknown ${what} id`);
}

export async function savePost(deps: ServiceDeps, id: string): Promise<void> {
  const post = await assertVisible(deps.db, deps.userId, id);
  if (post.ownerId === deps.userId) throw new ApiError(400, "bad_request", "That is your own post");
  await deps.db.transaction(async (tx) => {
    const rows = await tx.insert(itemSaves).values({ userId: deps.userId, itemId: id }).onConflictDoNothing().returning({ id: itemSaves.id });
    if (rows.length === 0) return;
    const [who] = await tx.select({ name: users.name }).from(users).where(eq(users.id, deps.userId));
    await notifyMany(tx, [{ userId: post.ownerId, type: "post_saved", payload: { itemId: id, title: post.title, person: who?.name } }]);
  });
}

export async function unsavePost(deps: ServiceDeps, id: string): Promise<void> {
  await deps.db.delete(itemSaves).where(and(eq(itemSaves.userId, deps.userId), eq(itemSaves.itemId, id)));
}

export async function updateSave(deps: ServiceDeps, id: string, body: UpdateSaveBody): Promise<PostDetail> {
  await deps.db.transaction(async (tx) => {
    const [save] = await tx
      .select({ id: itemSaves.id })
      .from(itemSaves)
      .where(and(eq(itemSaves.itemId, id), eq(itemSaves.userId, deps.userId)))
      .for("update");
    if (!save) throw new ApiError(404, "not_found", "You have not saved this post");
    if (body.note !== undefined) await tx.update(itemSaves).set({ note: body.note === "" ? null : body.note }).where(eq(itemSaves.id, save.id));
    if (body.folderIds) {
      await assertOwned(tx, folders, deps.userId, body.folderIds, "folder");
      await tx.delete(saveFolders).where(eq(saveFolders.saveId, save.id));
      const unique = [...new Set(body.folderIds)];
      if (unique.length) await tx.insert(saveFolders).values(unique.map((folderId) => ({ saveId: save.id, folderId })));
    }
    if (body.tagIds) {
      await assertOwned(tx, tags, deps.userId, body.tagIds, "tag");
      await tx.delete(saveTags).where(eq(saveTags.saveId, save.id));
      const unique = [...new Set(body.tagIds)];
      if (unique.length) await tx.insert(saveTags).values(unique.map((tagId) => ({ saveId: save.id, tagId })));
    }
  });
  return getPost(deps, id);
}

export async function listSaves(deps: ServiceDeps, query: SaveListQuery): Promise<SaveListResponse> {
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  const term = query.q ? `%${query.q.replace(/[\\%_]/g, "\\$&")}%` : null;
  const rows = await deps.db
    .select({
      ...postColumns(deps.userId),
      saveId: itemSaves.id,
      note: itemSaves.note,
      savedAt: itemSaves.savedAt,
      savedAtText: sql<string>`${itemSaves.savedAt}::text`,
      folderIds: sql<string[]>`array(select sf.folder_id::text from save_folders sf where sf.save_id = ${itemSaves.id})`,
      tagIds: sql<string[]>`array(select st.tag_id::text from save_tags st where st.save_id = ${itemSaves.id})`,
    })
    .from(itemSaves)
    .innerJoin(items, eq(items.id, itemSaves.itemId))
    .innerJoin(users, eq(users.id, items.userId))
    .where(
      and(
        eq(itemSaves.userId, deps.userId),
        visibleTo(deps.userId),
        query.folderId ? sql`exists (select 1 from save_folders sf where sf.save_id = ${itemSaves.id} and sf.folder_id = ${query.folderId}::uuid)` : undefined,
        query.tagId ? sql`exists (select 1 from save_tags st where st.save_id = ${itemSaves.id} and st.tag_id = ${query.tagId}::uuid)` : undefined,
        query.unfiled
          ? sql`not exists (select 1 from save_folders sf where sf.save_id = ${itemSaves.id}) and not exists (select 1 from save_tags st where st.save_id = ${itemSaves.id})`
          : undefined,
        term ? or(sql`${items.title} ilike ${term}`, sql`${items.caption} ilike ${term}`, sql`${itemSaves.note} ilike ${term}`) : undefined,
        cursor?.k === "ks" ? sql`(${itemSaves.savedAt}, ${itemSaves.id}) < (${cursor.s}::timestamptz, ${cursor.i}::uuid)` : undefined,
      ),
    )
    .orderBy(desc(itemSaves.savedAt), desc(itemSaves.id))
    .limit(query.limit + 1);
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  const saves: SaveSummary[] = await Promise.all(
    page.map(async (r) => ({
      ...(await toPost(deps, r)),
      saveId: r.saveId,
      note: r.note,
      savedAt: r.savedAt.toISOString(),
      folderIds: r.folderIds,
      tagIds: r.tagIds,
    })),
  );
  return { saves, nextCursor: rows.length > query.limit && last ? encodeCursor({ k: "ks", s: last.savedAtText, i: last.saveId }) : null };
}

// ── publishing and removal ──────────────────────────────────────────────

/**
 * Tells everyone who saved or liked these items that they are going away, then removes what hung off
 * them. Called inside the delete or un-publish transaction. For a delete the FK cascade would remove
 * the rows anyway; the notice has to be written before that.
 */
export async function retractPublic(tx: Db, ownerId: string, itemIds: readonly string[], type: "post_removed" | "post_unshared"): Promise<void> {
  if (itemIds.length === 0) return;
  const published = await tx
    .select({ id: items.id, title: items.title })
    .from(items)
    .where(and(inArray(items.id, [...itemIds]), eq(items.userId, ownerId), eq(items.visibility, "public")));
  if (published.length === 0) return;
  const ids = published.map((p) => p.id);
  const [owner] = await tx.select({ name: users.name }).from(users).where(eq(users.id, ownerId));

  const audience = await tx.execute<{ item_id: string; user_id: string }>(
    sql`select item_id, user_id from item_saves where item_id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})
        union select item_id, user_id from item_likes where item_id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`,
  );
  const titles = new Map(published.map((p) => [p.id, p.title]));
  await notifyMany(
    tx,
    [...audience]
      .filter((a) => a.user_id !== ownerId)
      .map((a) => ({ userId: a.user_id, type, payload: { title: titles.get(a.item_id) ?? null, person: owner?.name } })),
  );

  await tx.delete(itemSaves).where(inArray(itemSaves.itemId, ids));
  await tx.delete(itemLikes).where(inArray(itemLikes.itemId, ids));
  await tx.delete(itemFeedback).where(and(inArray(itemFeedback.itemId, ids), ne(itemFeedback.userId, ownerId)));
  await tx.delete(itemTried).where(and(inArray(itemTried.itemId, ids), ne(itemTried.userId, ownerId)));
}

/** Column changes for `items` when visibility is set; throws when the item cannot be published. */
export async function applyVisibility(
  tx: Db,
  ownerId: string,
  itemId: string,
  current: { visibility: Visibility; fetchStatus: string },
  next: Visibility,
): Promise<{ visibility: Visibility; publishedAt: Date | null } | null> {
  if (next === current.visibility) return null;
  if (next === "public") {
    if (current.fetchStatus !== "ready") throw new ApiError(409, "conflict", "Wait until the item has finished downloading");
    return { visibility: "public", publishedAt: new Date() };
  }
  await retractPublic(tx, ownerId, [itemId], "post_unshared");
  return { visibility: "private", publishedAt: null };
}

/** How many accounts saved a public item, for the "this removes N saves" warning. */
export async function saverCount(deps: ServiceDeps, id: string): Promise<number> {
  const [row] = await deps.db
    .select({ n: sql<number>`count(*)::int` })
    .from(itemSaves)
    .innerJoin(items, eq(items.id, itemSaves.itemId))
    .where(and(eq(itemSaves.itemId, id), eq(items.userId, deps.userId)));
  return row?.n ?? 0;
}
