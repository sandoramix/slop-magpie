import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { items } from "@magpie/db";
import { and, desc, eq, gt, lt, ne, or, sql } from "drizzle-orm";
import type { WorkerContext } from "../context.ts";
import { syncCredentials } from "../credentials.ts";
import { loginFor, readSessionState, writeSessionState } from "../sessions.ts";
import { getFetcher } from "../sources/index.ts";
import { checkSession } from "../strategies/instaloader.ts";
import { DEFAULT_STRATEGY_OPTIONS } from "../strategies/types.ts";

const REQUEUE_LIMIT = 100;
const REQUEUE_WINDOW_DAYS = 30;
// a private or removed post never recovers; each refetch counts as an attempt, so it stops being retried here
const REQUEUE_MAX_ATTEMPTS = 8;

/** Saves made while the session was dead: failed outright, or kept as a link with only the OpenGraph preview. */
async function requeueAffected(ctx: WorkerContext, sourceId: string): Promise<number> {
  const since = new Date(Date.now() - REQUEUE_WINDOW_DAYS * 24 * 3600_000);
  const rows = await ctx.db
    .select({ id: items.id })
    .from(items)
    .where(
      and(
        eq(items.source, sourceId),
        gt(items.savedAt, since),
        lt(items.fetchAttempts, REQUEUE_MAX_ATTEMPTS),
        or(
          and(eq(items.fetchStatus, "failed"), ne(items.availability, "gone")),
          and(eq(items.fetchStatus, "ready"), eq(items.kind, "link"), sql`${items.rawMeta}->>'strategy' = 'opengraph'`),
        ),
      ),
    )
    .limit(REQUEUE_LIMIT);
  for (const { id } of rows) await ctx.jobs.sendItemJob("fetch", { itemId: id });
  return rows.length;
}

/**
 * Every few hours: does the saved login session still work? Using it keeps it warm, and a dead one is
 * renewed here (one rate-limited password login) instead of on the next user save. When a dead session comes
 * back, everything saved in the meantime is fetched again.
 */
export async function sessionCheck(ctx: WorkerContext, sourceId = "instagram") {
  await syncCredentials(ctx, sourceId);
  const [probe] = await ctx.db
    .select({ url: items.canonicalUrl })
    .from(items)
    .where(and(eq(items.source, sourceId), eq(items.fetchStatus, "ready"), sql`${items.rawMeta}->>'strategy' <> 'opengraph'`))
    .orderBy(desc(items.savedAt))
    .limit(1);
  const login = loginFor(ctx, sourceId);
  if (!login || !probe) return { state: "unchecked" as const, requeued: 0 };

  await mkdir(ctx.tmpDir, { recursive: true });
  const tmpDir = await mkdtemp(path.join(ctx.tmpDir, "session-"));
  try {
    const verdict = await checkSession({
      url: probe.url,
      tmpDir,
      cookiesFile: null,
      login,
      guard: ctx.guard,
      run: ctx.run,
      log: ctx.log,
      maxDownloadBytes: ctx.maxDownloadBytes,
      options: { ...DEFAULT_STRATEGY_OPTIONS, ...getFetcher(sourceId).options },
    });
    if (verdict === "unknown") return { state: "unchecked" as const, requeued: 0 };

    const before = await readSessionState(ctx, sourceId);
    await writeSessionState(ctx, sourceId, verdict);
    if (verdict === "dead" && before !== "dead") {
      ctx.log.error({ source: sourceId }, "session is dead; saves fall back to previews until it is renewed (see docs/sources.md#when-the-session-dies)");
      await ctx.audit("session.dead", { source: sourceId });
    }
    if (verdict !== "ok") return { state: verdict, requeued: 0 };
    // every good check, not only a seen dead→ok flip: saves can fail between two checks without the check ever seeing a dead session
    const requeued = await requeueAffected(ctx, sourceId);
    if (requeued > 0 || before === "dead") {
      ctx.log.info({ source: sourceId, requeued }, before === "dead" ? "session is back; fetching affected items again" : "session is fine; fetching items saved without media again");
    }
    if (before === "dead") await ctx.audit("session.recovered", { source: sourceId, requeued });
    return { state: verdict, requeued };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
