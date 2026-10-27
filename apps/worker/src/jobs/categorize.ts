// v1 rule-based categorization (docs/worker-pipeline.md#categorize): learn keyword → folder/tag
// from manual assignments and score the item's keywords against them.
import {
  folders,
  itemFolderRejections,
  itemFolderSuggestions,
  itemFolders,
  itemKeywords,
  items,
  itemTagRejections,
  itemTagSuggestions,
  itemTags,
  tags,
} from "@magpie/db";
import { and, countDistinct, eq, exists, inArray, ne, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { WorkerContext } from "../context.ts";

/** Below this a suggestion is noise and is not stored. */
export const MIN_SUGGESTION = 0.25;
export const MAX_SUGGESTIONS = 5;

export interface KeywordEvidence {
  keyword: string;
  weight: number;
}

/**
 * Score per target: weighted average over the item's keywords of P(target | keyword), smoothed
 * with +1 in the denominator so a keyword seen on one item gives at most 0.5. Keywords never seen
 * on a categorized item don't count against the score.
 */
export function scoreTargets(
  keywords: readonly KeywordEvidence[],
  /** keyword → number of manually categorized items carrying it */
  df: ReadonlyMap<string, number>,
  /** `${keyword}\u0000${targetId}` → items with that keyword assigned to the target */
  pairs: ReadonlyMap<string, number>,
): Map<string, number> {
  const weights = new Map<string, number>();
  for (const k of keywords) weights.set(k.keyword, Math.max(weights.get(k.keyword) ?? 0, k.weight));
  const known = [...weights].filter(([k]) => (df.get(k) ?? 0) > 0);
  const total = known.reduce((s, [, w]) => s + w, 0);
  const scores = new Map<string, number>();
  if (total === 0) return scores;
  for (const [pair, n] of pairs) {
    const [keyword = "", target = ""] = pair.split("\u0000");
    const w = weights.get(keyword);
    const d = df.get(keyword);
    if (w === undefined || !d) continue;
    scores.set(target, (scores.get(target) ?? 0) + (w * n) / (d + 1));
  }
  for (const [t, s] of scores) scores.set(t, Math.round((s / total) * 1000) / 1000);
  return scores;
}

/** Folds case and separators so the hashtag `#slow_cooker` matches a tag named "Slow cooker". */
export const nameKey = (name: string) => name.normalize("NFC").toLowerCase().replace(/[\s_\-.#]+/g, "");

/**
 * Cold start: a keyword that equals the name of an existing tag or folder is a suggestion even with no history.
 * Hashtags are deliberate, so they count more than words that merely occur in the caption.
 */
export function scoreNameMatches(keywords: readonly KeywordEvidence[], targets: readonly { id: string; name: string }[]): Map<string, number> {
  const byKey = new Map<string, number>();
  for (const k of keywords) {
    const key = nameKey(k.keyword);
    byKey.set(key, Math.max(byKey.get(key) ?? 0, k.weight));
  }
  const scores = new Map<string, number>();
  for (const t of targets) {
    const w = byKey.get(nameKey(t.name));
    if (w !== undefined && nameKey(t.name).length >= 3) scores.set(t.id, Math.round(w * 0.7 * 1000) / 1000);
  }
  return scores;
}

/**
 * Same author: share of the author's categorized items that went to the target, smoothed (+1) so one example
 * gives 0.45 and it takes about eight consistent ones to reach auto-assign territory.
 */
export function scoreAuthor(categorized: number, perTarget: ReadonlyMap<string, number>): Map<string, number> {
  const scores = new Map<string, number>();
  for (const [target, n] of perTarget) scores.set(target, Math.round(((0.9 * n) / (categorized + 1)) * 1000) / 1000);
  return scores;
}

/** Independent signals agree: 1 - ∏(1 - s). */
export function combineScores(...signals: readonly ReadonlyMap<string, number>[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const signal of signals) {
    for (const [id, s] of signal) out.set(id, 1 - (1 - (out.get(id) ?? 0)) * (1 - s));
  }
  for (const [id, s] of out) out.set(id, Math.round(s * 1000) / 1000);
  return out;
}

type LinkTable = typeof itemFolders | typeof itemTags;

/** Manual assignments of the owner's other items by the same author on the same source. */
async function authorEvidence(ctx: WorkerContext, userId: string, itemId: string, source: string, handle: string | null, table: LinkTable, targetColumn: PgColumn) {
  if (!handle) return new Map<string, number>();
  const same = and(eq(items.userId, userId), eq(items.source, source), eq(items.authorHandle, handle), ne(items.id, itemId));
  const [total] = await ctx.db
    .select({ n: countDistinct(items.id) })
    .from(items)
    .innerJoin(table, and(eq(table.itemId, items.id), eq(table.assignedBy, "manual")))
    .where(same);
  const rows = await ctx.db
    .select({ target: sql<string>`${targetColumn}`, n: countDistinct(items.id) })
    .from(items)
    .innerJoin(table, and(eq(table.itemId, items.id), eq(table.assignedBy, "manual")))
    .where(same)
    .groupBy(targetColumn);
  return scoreAuthor(total?.n ?? 0, new Map(rows.map((r) => [r.target, r.n])));
}

/** Evidence comes only from the owner's own items: libraries never learn from each other. */
async function evidence(ctx: WorkerContext, userId: string, itemId: string, words: string[], table: LinkTable, targetColumn: PgColumn) {
  const categorized = exists(
    ctx.db
      .select({ one: sql`1` })
      .from(table)
      .where(and(eq(table.itemId, itemKeywords.itemId), eq(table.assignedBy, "manual"))),
  );
  const dfRows = await ctx.db
    .select({ keyword: itemKeywords.keyword, n: countDistinct(itemKeywords.itemId) })
    .from(itemKeywords)
    .innerJoin(items, eq(items.id, itemKeywords.itemId))
    .where(and(eq(items.userId, userId), inArray(itemKeywords.keyword, words), ne(itemKeywords.itemId, itemId), categorized))
    .groupBy(itemKeywords.keyword);
  const pairRows = await ctx.db
    .select({ keyword: itemKeywords.keyword, target: sql<string>`${targetColumn}`, n: countDistinct(itemKeywords.itemId) })
    .from(itemKeywords)
    .innerJoin(table, and(eq(table.itemId, itemKeywords.itemId), eq(table.assignedBy, "manual")))
    .innerJoin(items, eq(items.id, itemKeywords.itemId))
    .where(and(eq(items.userId, userId), inArray(itemKeywords.keyword, words), ne(itemKeywords.itemId, itemId)))
    .groupBy(itemKeywords.keyword, targetColumn);
  return {
    df: new Map(dfRows.map((r) => [r.keyword, r.n])),
    pairs: new Map(pairRows.map((r) => [`${r.keyword}\u0000${r.target}`, r.n])),
  };
}

export interface CategorizeResult {
  autoFolders: number;
  autoTags: number;
  suggestions: number;
}

export async function categorizeItem(ctx: WorkerContext, itemId: string): Promise<CategorizeResult> {
  const result: CategorizeResult = { autoFolders: 0, autoTags: 0, suggestions: 0 };
  const [item] = await ctx.db
    .select({ id: items.id, userId: items.userId, source: items.source, authorHandle: items.authorHandle })
    .from(items)
    .where(eq(items.id, itemId));
  if (!item) return result;
  const keywords = await ctx.db
    .select({ keyword: itemKeywords.keyword, weight: itemKeywords.weight })
    .from(itemKeywords)
    .where(eq(itemKeywords.itemId, itemId));
  const words = [...new Set(keywords.map((k) => k.keyword))];

  const [folderEv, tagEv] = words.length
    ? await Promise.all([
        evidence(ctx, item.userId, itemId, words, itemFolders, itemFolders.folderId),
        evidence(ctx, item.userId, itemId, words, itemTags, itemTags.tagId),
      ])
    : [null, null];
  const [folderNames, tagNames, authorFolders, authorTags] = await Promise.all([
    ctx.db.select({ id: folders.id, name: folders.name }).from(folders).where(eq(folders.userId, item.userId)),
    ctx.db.select({ id: tags.id, name: tags.name }).from(tags).where(eq(tags.userId, item.userId)),
    authorEvidence(ctx, item.userId, itemId, item.source, item.authorHandle, itemFolders, itemFolders.folderId),
    authorEvidence(ctx, item.userId, itemId, item.source, item.authorHandle, itemTags, itemTags.tagId),
  ]);
  const folderScores = combineScores(
    folderEv ? scoreTargets(keywords, folderEv.df, folderEv.pairs) : new Map<string, number>(),
    scoreNameMatches(keywords, folderNames),
    authorFolders,
  );
  const tagScores = combineScores(
    tagEv ? scoreTargets(keywords, tagEv.df, tagEv.pairs) : new Map<string, number>(),
    scoreNameMatches(keywords, tagNames),
    authorTags,
  );

  const threshold = ctx.autoAssignThreshold;
  await ctx.db.transaction(async (tx) => {
    // places the item is already in, plus places the owner undid before: neither is proposed (again)
    const haveFolders = new Set([
      ...(await tx.select({ id: itemFolders.folderId }).from(itemFolders).where(eq(itemFolders.itemId, itemId))).map((r) => r.id),
      ...(await tx.select({ id: itemFolderRejections.folderId }).from(itemFolderRejections).where(eq(itemFolderRejections.itemId, itemId))).map((r) => r.id),
    ]);
    const haveTags = new Set([
      ...(await tx.select({ id: itemTags.tagId }).from(itemTags).where(eq(itemTags.itemId, itemId))).map((r) => r.id),
      ...(await tx.select({ id: itemTagRejections.tagId }).from(itemTagRejections).where(eq(itemTagRejections.itemId, itemId))).map((r) => r.id),
    ]);
    await tx.delete(itemFolderSuggestions).where(eq(itemFolderSuggestions.itemId, itemId));
    await tx.delete(itemTagSuggestions).where(eq(itemTagSuggestions.itemId, itemId));

    const rank = (scores: Map<string, number>, have: Set<string>) =>
      [...scores].filter(([id, s]) => !have.has(id) && s >= MIN_SUGGESTION).sort((a, b) => b[1] - a[1]);

    const rankedFolders = rank(folderScores, haveFolders);
    const autoF = rankedFolders.filter(([, s]) => s >= threshold);
    const suggestF = rankedFolders.filter(([, s]) => s < threshold).slice(0, MAX_SUGGESTIONS);
    if (autoF.length) await tx.insert(itemFolders).values(autoF.map(([folderId, confidence]) => ({ itemId, folderId, assignedBy: "auto" as const, confidence })));
    if (suggestF.length) await tx.insert(itemFolderSuggestions).values(suggestF.map(([folderId, confidence]) => ({ itemId, folderId, confidence })));

    const rankedTags = rank(tagScores, haveTags);
    const autoT = rankedTags.filter(([, s]) => s >= threshold);
    const suggestT = rankedTags.filter(([, s]) => s < threshold).slice(0, MAX_SUGGESTIONS);
    if (autoT.length) await tx.insert(itemTags).values(autoT.map(([tagId, confidence]) => ({ itemId, tagId, assignedBy: "auto" as const, confidence })));
    if (suggestT.length) await tx.insert(itemTagSuggestions).values(suggestT.map(([tagId, confidence]) => ({ itemId, tagId, confidence })));

    result.autoFolders = autoF.length;
    result.autoTags = autoT.length;
    result.suggestions = suggestF.length + suggestT.length;
  });
  return result;
}
