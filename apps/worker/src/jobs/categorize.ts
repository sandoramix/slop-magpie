// v1 rule-based categorization (docs/worker-pipeline.md#categorize): learn keyword → folder/tag
// from manual assignments and score the item's keywords against them.
import { itemFolderSuggestions, itemFolders, itemKeywords, items, itemTagSuggestions, itemTags } from "@magpie/db";
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

type LinkTable = typeof itemFolders | typeof itemTags;

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
  const [item] = await ctx.db.select({ id: items.id, userId: items.userId }).from(items).where(eq(items.id, itemId));
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
  const folderScores = folderEv ? scoreTargets(keywords, folderEv.df, folderEv.pairs) : new Map<string, number>();
  const tagScores = tagEv ? scoreTargets(keywords, tagEv.df, tagEv.pairs) : new Map<string, number>();

  const threshold = ctx.autoAssignThreshold;
  await ctx.db.transaction(async (tx) => {
    const haveFolders = new Set((await tx.select({ id: itemFolders.folderId }).from(itemFolders).where(eq(itemFolders.itemId, itemId))).map((r) => r.id));
    const haveTags = new Set((await tx.select({ id: itemTags.tagId }).from(itemTags).where(eq(itemTags.itemId, itemId))).map((r) => r.id));
    await tx.delete(itemFolderSuggestions).where(eq(itemFolderSuggestions.itemId, itemId));
    await tx.delete(itemTagSuggestions).where(eq(itemTagSuggestions.itemId, itemId));

    const rank = (scores: Map<string, number>, have: Set<string>) =>
      [...scores].filter(([id, s]) => !have.has(id) && s >= MIN_SUGGESTION).sort((a, b) => b[1] - a[1]);

    const folders = rank(folderScores, haveFolders);
    const autoF = folders.filter(([, s]) => s >= threshold);
    const suggestF = folders.filter(([, s]) => s < threshold).slice(0, MAX_SUGGESTIONS);
    if (autoF.length) await tx.insert(itemFolders).values(autoF.map(([folderId, confidence]) => ({ itemId, folderId, assignedBy: "auto" as const, confidence })));
    if (suggestF.length) await tx.insert(itemFolderSuggestions).values(suggestF.map(([folderId, confidence]) => ({ itemId, folderId, confidence })));

    const tags = rank(tagScores, haveTags);
    const autoT = tags.filter(([, s]) => s >= threshold);
    const suggestT = tags.filter(([, s]) => s < threshold).slice(0, MAX_SUGGESTIONS);
    if (autoT.length) await tx.insert(itemTags).values(autoT.map(([tagId, confidence]) => ({ itemId, tagId, assignedBy: "auto" as const, confidence })));
    if (suggestT.length) await tx.insert(itemTagSuggestions).values(suggestT.map(([tagId, confidence]) => ({ itemId, tagId, confidence })));

    result.autoFolders = autoF.length;
    result.autoTags = autoT.length;
    result.suggestions = suggestF.length + suggestT.length;
  });
  return result;
}
