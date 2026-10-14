import { items, media } from "@magpie/db";
import { and, eq, exists, isNull, lt, sql } from "drizzle-orm";
import type { WorkerContext } from "../context.ts";

/**
 * Safety net (every 15 min): re-enqueues work that was lost, e.g. the API could not reach the
 * queue, or the worker died mid-job. Jobs are idempotent and fetch is singleton per item.
 */
export async function sweep(ctx: WorkerContext, now: Date = new Date()) {
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
  const stuck = await ctx.db
    .select({ id: items.id })
    .from(items)
    .where(
      // pending with an error = waiting for a pg-boss retry (up to 1 h); leave those alone longer
      sql`(${items.fetchStatus} = 'pending' and ${items.fetchError} is null and ${items.updatedAt} < ${minutesAgo(10).toISOString()}::timestamptz)
        or (${items.fetchStatus} = 'pending' and ${items.updatedAt} < ${minutesAgo(180).toISOString()}::timestamptz)
        or (${items.fetchStatus} = 'fetching' and ${items.updatedAt} < ${minutesAgo(30).toISOString()}::timestamptz)`,
    )
    .limit(200);
  for (const { id } of stuck) await ctx.jobs.sendItemJob("fetch", { itemId: id });

  const noThumb = await ctx.db
    .select({ id: items.id })
    .from(items)
    .where(
      and(
        eq(items.fetchStatus, "ready"),
        lt(items.updatedAt, minutesAgo(30)),
        exists(ctx.db.select({ one: sql`1` }).from(media).where(and(eq(media.itemId, items.id), isNull(media.thumbKey)))),
      ),
    )
    .limit(200);
  for (const { id } of noThumb) await ctx.jobs.sendItemJob("thumbnail", { itemId: id });
  return { fetch: stuck.length, thumbnail: noThumb.length };
}
