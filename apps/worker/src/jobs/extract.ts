import { itemKeywords, items } from "@magpie/db";
import { and, eq, inArray } from "drizzle-orm";
import type { WorkerContext } from "../context.ts";
import { extractKeywords } from "../text/keywords.ts";

/** Rebuilds the automatic keywords (hashtag/caption); manual ones are kept. Then queues `categorize`. */
export async function extractItem(ctx: WorkerContext, itemId: string): Promise<number> {
  const [item] = await ctx.db.select({ title: items.title, caption: items.caption }).from(items).where(eq(items.id, itemId));
  if (!item) return 0;
  const keywords = extractKeywords(item);
  await ctx.db.transaction(async (tx) => {
    await tx.delete(itemKeywords).where(and(eq(itemKeywords.itemId, itemId), inArray(itemKeywords.source, ["hashtag", "caption"])));
    if (keywords.length) await tx.insert(itemKeywords).values(keywords.map((k) => ({ ...k, itemId }))).onConflictDoNothing();
  });
  await ctx.jobs.sendItemJob("categorize", { itemId });
  return keywords.length;
}
