import { itemFolders, items, itemTags } from "@magpie/db";
import { and, eq, notExists, sql } from "drizzle-orm";
import type { WorkerContext } from "../context.ts";

export const RECATEGORIZE_BATCH = 300;

/**
 * Nightly: items that are still in no folder and carry no tag get their suggestions recomputed, because
 * the library has learned from every item organized since they were saved. A random batch per night, so a big backlog is covered over several nights.
 */
export async function recategorize(ctx: WorkerContext, batch = RECATEGORIZE_BATCH): Promise<number> {
  const rows = await ctx.db
    .select({ id: items.id })
    .from(items)
    .where(
      and(
        eq(items.fetchStatus, "ready"),
        notExists(ctx.db.select({ one: sql`1` }).from(itemFolders).where(eq(itemFolders.itemId, items.id))),
        notExists(ctx.db.select({ one: sql`1` }).from(itemTags).where(eq(itemTags.itemId, items.id))),
      ),
    )
    .orderBy(sql`random()`)
    .limit(batch);
  for (const { id } of rows) await ctx.jobs.sendItemJob("categorize", { itemId: id });
  return rows.length;
}
