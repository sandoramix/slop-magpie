import { itemKeywords, items, stopTerms } from "@magpie/db";
import { and, eq, inArray } from "drizzle-orm";
import type { WorkerContext } from "../context.ts";
import { extractKeywords } from "../text/keywords.ts";

/**
 * Rebuilds the automatic keywords (hashtag/caption) without the owner's stop terms; manual ones are kept.
 * Then stores the item's embedding (when an embedder is configured) and queues `categorize`.
 */
export async function extractItem(ctx: WorkerContext, itemId: string): Promise<number> {
  const [item] = await ctx.db
    .select({ title: items.title, caption: items.caption, userId: items.userId })
    .from(items)
    .where(eq(items.id, itemId));
  if (!item) return 0;
  const ignore = new Set((await ctx.db.select({ term: stopTerms.term }).from(stopTerms).where(eq(stopTerms.userId, item.userId))).map((r) => r.term));
  const keywords = extractKeywords(item, { ignore });
  await ctx.db.transaction(async (tx) => {
    await tx.delete(itemKeywords).where(and(eq(itemKeywords.itemId, itemId), inArray(itemKeywords.source, ["hashtag", "caption"])));
    if (keywords.length) await tx.insert(itemKeywords).values(keywords.map((k) => ({ ...k, itemId }))).onConflictDoNothing();
  });
  await embed(ctx, itemId, item, keywords);
  await ctx.jobs.sendItemJob("categorize", { itemId });
  return keywords.length;
}

async function embed(
  ctx: WorkerContext,
  itemId: string,
  item: { title: string | null; caption: string | null },
  keywords: readonly { keyword: string; weight: number }[],
): Promise<void> {
  if (!ctx.embedder) return;
  try {
    const manual = await ctx.db
      .select({ keyword: itemKeywords.keyword, weight: itemKeywords.weight })
      .from(itemKeywords)
      .where(and(eq(itemKeywords.itemId, itemId), eq(itemKeywords.source, "manual")));
    const terms = [...keywords, ...manual].map((k) => ({ term: k.keyword, weight: k.weight }));
    const vector = await ctx.embedder.embed({ text: [item.title, item.caption].filter(Boolean).join("\n"), terms });
    await ctx.db.update(items).set({ embedding: vector.length ? vector : null }).where(eq(items.id, itemId));
  } catch (error) {
    // clusters are a bonus; a failing embedder must not stop the pipeline
    ctx.log.warn({ err: error, itemId }, "embedding failed");
  }
}
