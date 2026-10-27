// "How did it go?": one verdict per person and item, plus the dashboard that summarizes progress.
import { itemFeedback, itemSaves, items, itemTried, users } from "@magpie/db";
import {
  type DashboardFeedbackQuery,
  type DashboardFeedbackResponse,
  type DashboardProgress,
  FEEDBACK_PROMPT_AFTER_DAYS,
  FEEDBACK_SNOOZE_DAYS,
  type FeedbackEntry,
  type FeedbackReason,
  type SetFeedbackBody,
} from "@magpie/shared/api";
import { and, desc, eq, ne, type SQL, sql } from "drizzle-orm";
import type { ServiceDeps } from "../deps.ts";
import { ApiError } from "../http/errors.ts";
import { decodeCursor, encodeCursor } from "./cursor.ts";
import { notifyMany } from "./notifications.ts";
import { assertVisible, visibleTo } from "./posts.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function setFeedback(deps: ServiceDeps, id: string, body: SetFeedbackBody): Promise<void> {
  const post = await assertVisible(deps.db, deps.userId, id);
  const reasons = [...new Set(body.reasons)];
  await deps.db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: itemFeedback.id })
      .from(itemFeedback)
      .where(and(eq(itemFeedback.itemId, id), eq(itemFeedback.userId, deps.userId)));
    if (existing) {
      await tx.update(itemFeedback).set({ verdict: body.verdict, reasons }).where(eq(itemFeedback.id, existing.id));
      return;
    }
    await tx.insert(itemFeedback).values({ userId: deps.userId, itemId: id, verdict: body.verdict, reasons });
    if (post.ownerId !== deps.userId) {
      await notifyMany(tx, [{ userId: post.ownerId, type: "feedback_received", payload: { itemId: id, title: post.title, verdict: body.verdict } }]);
    }
  });
}

export async function deleteFeedback(deps: ServiceDeps, id: string): Promise<void> {
  await deps.db.delete(itemFeedback).where(and(eq(itemFeedback.itemId, id), eq(itemFeedback.userId, deps.userId)));
}

/** "I tried it": the verdict prompt for this item follows. */
export async function setTried(deps: ServiceDeps, id: string, tried: boolean): Promise<void> {
  await assertVisible(deps.db, deps.userId, id);
  if (tried) await deps.db.insert(itemTried).values({ userId: deps.userId, itemId: id }).onConflictDoNothing();
  else await deps.db.delete(itemTried).where(and(eq(itemTried.userId, deps.userId), eq(itemTried.itemId, id)));
}

/** "Not yet": a save is not asked about again for a while. */
export async function snoozeFeedback(deps: ServiceDeps, id: string): Promise<void> {
  const rows = await deps.db
    .update(itemSaves)
    .set({ feedbackSnoozedUntil: new Date(Date.now() + FEEDBACK_SNOOZE_DAYS * DAY_MS) })
    .where(and(eq(itemSaves.itemId, id), eq(itemSaves.userId, deps.userId)))
    .returning({ id: itemSaves.id });
  if (rows.length === 0) throw new ApiError(404, "not_found", "You have not saved this post");
}

const PROMPT_LIMIT = 3;

/**
 * Items waiting for a verdict: saved a few days ago and not snoozed, or marked "I tried it". Only
 * visible posts, only ones with no verdict yet. Resolved to cards by the caller's post lookup.
 */
export async function duePromptIds(deps: ServiceDeps): Promise<string[]> {
  const threshold = new Date(Date.now() - FEEDBACK_PROMPT_AFTER_DAYS * DAY_MS);
  const noVerdict = sql`not exists (select 1 from item_feedback f where f.item_id = ${items.id} and f.user_id = ${deps.userId}::uuid)`;
  const saved = await deps.db
    .select({ id: items.id, at: itemSaves.savedAt })
    .from(itemSaves)
    .innerJoin(items, eq(items.id, itemSaves.itemId))
    .where(
      and(
        eq(itemSaves.userId, deps.userId),
        sql`${itemSaves.savedAt} < ${threshold}`,
        sql`(${itemSaves.feedbackSnoozedUntil} is null or ${itemSaves.feedbackSnoozedUntil} < now())`,
        noVerdict,
        visibleTo(deps.userId),
      ),
    )
    .orderBy(itemSaves.savedAt)
    .limit(PROMPT_LIMIT);
  const tried = await deps.db
    .select({ id: items.id, at: itemTried.triedAt })
    .from(itemTried)
    .innerJoin(items, eq(items.id, itemTried.itemId))
    .where(and(eq(itemTried.userId, deps.userId), noVerdict))
    .orderBy(itemTried.triedAt)
    .limit(PROMPT_LIMIT);
  // tried first (the person asked for it), then by age
  return [...new Set([...tried.map((r) => r.id), ...saved.map((r) => r.id)])].slice(0, PROMPT_LIMIT);
}

// ── dashboard ───────────────────────────────────────────────────────────

export async function progress(deps: ServiceDeps): Promise<DashboardProgress> {
  const u = sql`${deps.userId}::uuid`;
  const [row] = await deps.db.execute<{
    items_imported: number;
    items_filed: number;
    public_items: number;
    saves_from_others: number;
    followers: number;
    following: number;
    feedback_given: number;
    feedback_received: number;
    worked_received: number;
    awaiting: number;
  }>(sql`select
    (select count(*)::int from items where user_id = ${u}) as items_imported,
    (select count(*)::int from items i where i.user_id = ${u} and (exists (select 1 from item_tags t where t.item_id = i.id) or exists (select 1 from item_folders f where f.item_id = i.id))) as items_filed,
    (select count(*)::int from items where user_id = ${u} and visibility = 'public') as public_items,
    (select count(*)::int from item_saves s join items i on i.id = s.item_id where i.user_id = ${u}) as saves_from_others,
    (select count(*)::int from follows where followee_id = ${u}) as followers,
    (select count(*)::int from follows where follower_id = ${u}) as following,
    (select count(*)::int from item_feedback where user_id = ${u}) as feedback_given,
    (select count(*)::int from item_feedback f join items i on i.id = f.item_id where i.user_id = ${u} and f.user_id <> ${u}) as feedback_received,
    (select count(*)::int from item_feedback f join items i on i.id = f.item_id where i.user_id = ${u} and f.user_id <> ${u} and f.verdict = 'worked') as worked_received,
    (select count(*)::int from (
      select item_id from item_saves where user_id = ${u} union select item_id from item_tried where user_id = ${u}
    ) w where not exists (select 1 from item_feedback f where f.item_id = w.item_id and f.user_id = ${u})) as awaiting`);
  if (!row) throw new Error("progress query returned no row");

  const weeks = await deps.db.execute<{ w: Date }>(sql`select distinct date_trunc('week', ts) as w from (
      select created_at as ts from items where user_id = ${u}
      union all select saved_at from item_saves where user_id = ${u}
      union all select created_at from item_feedback where user_id = ${u}
    ) a order by w desc limit 120`);
  return {
    itemsImported: row.items_imported,
    filedShare: row.items_imported === 0 ? 0 : row.items_filed / row.items_imported,
    publicItems: row.public_items,
    savesFromOthers: row.saves_from_others,
    followers: row.followers,
    following: row.following,
    feedbackGiven: row.feedback_given,
    feedbackReceived: row.feedback_received,
    helpfulShare: row.feedback_received === 0 ? null : row.worked_received / row.feedback_received,
    awaitingFeedback: row.awaiting,
    activeWeeks: consecutiveWeeks([...weeks].map((r) => new Date(r.w))),
  };
}

const WEEK_MS = 7 * DAY_MS;

/** Weeks (Monday starts, newest first) in a row counted back from this week; an empty current week does not break it. */
export function consecutiveWeeks(starts: readonly Date[], now = new Date()): number {
  if (starts.length === 0) return 0;
  const monday = (d: Date) => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return x.getTime();
  };
  const seen = new Set(starts.map((d) => monday(d)));
  let cursor = monday(now);
  if (!seen.has(cursor)) cursor -= WEEK_MS;
  let n = 0;
  while (seen.has(cursor)) {
    n++;
    cursor -= WEEK_MS;
  }
  return n;
}

export async function dashboardFeedback(deps: ServiceDeps, query: DashboardFeedbackQuery): Promise<DashboardFeedbackResponse> {
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  const received = query.tab === "received";
  const conditions: (SQL | undefined)[] = [
    received ? and(eq(items.userId, deps.userId), ne(itemFeedback.userId, deps.userId)) : eq(itemFeedback.userId, deps.userId),
    query.verdict ? eq(itemFeedback.verdict, query.verdict) : undefined,
    query.itemId ? eq(itemFeedback.itemId, query.itemId) : undefined,
    cursor?.k === "ks" ? sql`(${itemFeedback.updatedAt}, ${itemFeedback.id}) < (${cursor.s}::timestamptz, ${cursor.i}::uuid)` : undefined,
  ];
  const rows = await deps.db
    .select({
      id: itemFeedback.id,
      itemId: items.id,
      title: items.title,
      verdict: itemFeedback.verdict,
      reasons: itemFeedback.reasons,
      updatedAt: itemFeedback.updatedAt,
      updatedAtText: sql<string>`${itemFeedback.updatedAt}::text`,
      thumb: sql<string | null>`(select coalesce(m.thumb_key, case when m.type = 'image' then m.storage_key end) from media m where m.item_id = ${items.id} order by m.position limit 1)`,
      byId: users.id,
      byName: users.name,
      byDisplayName: users.displayName,
    })
    .from(itemFeedback)
    .innerJoin(items, eq(items.id, itemFeedback.itemId))
    .innerJoin(users, eq(users.id, itemFeedback.userId))
    .where(and(...conditions))
    .orderBy(desc(itemFeedback.updatedAt), desc(itemFeedback.id))
    .limit(query.limit + 1);
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  const entries: FeedbackEntry[] = await Promise.all(
    page.map(async (r) => ({
      id: r.id,
      itemId: r.itemId,
      itemTitle: r.title,
      thumbUrl: r.thumb ? await deps.store.signedUrl(r.thumb, deps.mediaUrlTtlSeconds) : null,
      verdict: r.verdict,
      reasons: r.reasons as FeedbackReason[],
      updatedAt: r.updatedAt.toISOString(),
      by: received ? { id: r.byId, name: r.byName, displayName: r.byDisplayName } : null,
    })),
  );
  return { entries, nextCursor: rows.length > query.limit && last ? encodeCursor({ k: "ks", s: last.updatedAtText, i: last.id }) : null };
}
