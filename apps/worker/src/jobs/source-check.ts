import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { items } from "@magpie/db";
import { asc, eq, sql } from "drizzle-orm";
import type { WorkerContext } from "../context.ts";
import { syncCredentials } from "../credentials.ts";
import { cookiesFor, loginFor } from "../sessions.ts";
import { getFetcher, strategyOrder } from "../sources/index.ts";
import { DEFAULT_STRATEGY_OPTIONS } from "../strategies/types.ts";

export const SOURCE_CHECK_BATCH = 50;

/**
 * Weekly probe of the least recently checked items: is the original still online? Only updates
 * `availability`; never deletes anything (docs/worker-pipeline.md#source-check).
 */
export async function sourceCheck(ctx: WorkerContext, options: { batch?: number; pauseMs?: number } = {}) {
  const rows = await ctx.db
    .select({ id: items.id, url: items.sourceUrl, canonicalUrl: items.canonicalUrl, source: items.source })
    .from(items)
    .where(eq(items.fetchStatus, "ready"))
    .orderBy(sql`${items.availabilityCheckedAt} asc nulls first`, asc(items.savedAt))
    .limit(options.batch ?? SOURCE_CHECK_BATCH);

  const counts = { available: 0, gone: 0, unknown: 0 };
  await mkdir(ctx.tmpDir, { recursive: true });
  for (const row of rows) {
    const tmpDir = await mkdtemp(path.join(ctx.tmpDir, "check-"));
    try {
      await syncCredentials(ctx, row.source);
      const fetcher = getFetcher(row.source);
      const first = strategyOrder(fetcher, row.canonicalUrl)[0] ?? "opengraph";
      const cookiesFile = await cookiesFor(ctx, row.source, tmpDir);
      const status = await ctx.strategies[first].probe({
        url: row.canonicalUrl,
        tmpDir,
        cookiesFile,
        login: loginFor(ctx, row.source),
        guard: ctx.guard,
        run: ctx.run,
        log: ctx.log,
        maxDownloadBytes: ctx.maxDownloadBytes,
        options: { ...DEFAULT_STRATEGY_OPTIONS, ...fetcher.options },
      });
      counts[status] += 1;
      // "unknown" (rate limit, network) keeps the previous verdict but still rotates the item
      await ctx.db
        .update(items)
        .set({ availabilityCheckedAt: new Date(), ...(status === "unknown" ? {} : { availability: status }) })
        .where(eq(items.id, row.id));
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
    if (options.pauseMs !== 0) await sleep(options.pauseMs ?? 5000);
  }
  return counts;
}
