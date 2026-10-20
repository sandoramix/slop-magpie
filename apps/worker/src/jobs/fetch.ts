import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import path from "node:path";
import { items, itemFolders, itemTags, media, users } from "@magpie/db";
import { resolveSource } from "@magpie/shared/sources";
import { extensionForContentType, itemKeys } from "@magpie/storage";
import { and, eq, ne, or, sql } from "drizzle-orm";
import type { WorkerContext } from "../context.ts";
import { probeFile, sha256File } from "../media/probe.ts";
import { transcodeVideo } from "../media/transcode.ts";
import { BlockedTargetError, expandUrl } from "../net/ssrf.ts";
import { getFetcher, strategyOrder } from "../sources/index.ts";
import { runChain } from "../strategies/chain.ts";
import { cookiesFor, loginFor } from "../sessions.ts";
import { type ErrorClass, errorMessage, logUrl } from "../strategies/errors.ts";
import { DEFAULT_STRATEGY_OPTIONS, type FetchedFile, type FetchResult } from "../strategies/types.ts";
import { titleFromCaption } from "../text/keywords.ts";

/** Thrown to make pg-boss retry the job. */
export class RetryableFetchError extends Error {
  override name = "RetryableFetchError";
}

export interface FetchJobInfo {
  itemId: string;
  /** True when pg-boss will not retry this job again. */
  lastAttempt: boolean;
  signal?: AbortSignal;
}

export type FetchOutcome = "ready" | "merged" | "failed" | "retry" | "skipped";

// hosts whose links are only redirects to the real post
const SHORT_LINK_HOSTS = new Set(["t.co", "bit.ly", "tinyurl.com", "pin.it", "vm.tiktok.com", "vt.tiktok.com", "youtu.be", "fb.watch", "redd.it", "goo.gl", "ow.ly", "buff.ly", "lnkd.in", "instagr.am"]);

function needsExpansion(url: URL, sourceId: string): boolean {
  if (SHORT_LINK_HOSTS.has(url.hostname.toLowerCase())) return true;
  // Instagram /share/... links carry an opaque id and redirect to the post
  return sourceId === "instagram" && url.pathname.startsWith("/share/");
}

/** Moves links and notes of a duplicate onto the existing item, then deletes the duplicate. */
async function mergeInto(ctx: WorkerContext, fromId: string, toId: string): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    const [from] = await tx.select({ notes: items.notes }).from(items).where(eq(items.id, fromId));
    const [to] = await tx.select({ notes: items.notes }).from(items).where(eq(items.id, toId));
    const folderLinks = await tx.select().from(itemFolders).where(eq(itemFolders.itemId, fromId));
    const tagLinks = await tx.select().from(itemTags).where(eq(itemTags.itemId, fromId));
    if (folderLinks.length) await tx.insert(itemFolders).values(folderLinks.map((l) => ({ ...l, itemId: toId }))).onConflictDoNothing();
    if (tagLinks.length) await tx.insert(itemTags).values(tagLinks.map((l) => ({ ...l, itemId: toId }))).onConflictDoNothing();
    if (from?.notes && !to?.notes) await tx.update(items).set({ notes: from.notes }).where(eq(items.id, toId));
    await tx.delete(items).where(eq(items.id, fromId));
  });
  await ctx.jobs.sendItemJob("blobDelete", { itemId: fromId });
}

/**
 * Message when saving `incoming` more bytes would push the account over its storage limit, else null.
 * Other items only: the item being (re)fetched replaces its own files.
 */
async function quotaError(ctx: WorkerContext, userId: string, itemId: string, incoming: number): Promise<string | null> {
  const [owner] = await ctx.db.select({ limit: users.storageLimitBytes }).from(users).where(eq(users.id, userId));
  if (!owner || owner.limit === null) return null;
  const [row] = await ctx.db
    .select({ used: sql<number>`coalesce(sum(${media.bytes}), 0)::float8` })
    .from(media)
    .innerJoin(items, eq(items.id, media.itemId))
    .where(and(eq(items.userId, userId), ne(items.id, itemId)));
  const used = row?.used ?? 0;
  if (used + incoming <= owner.limit) return null;
  const gb = (n: number) => `${(n / 1024 ** 3).toFixed(1)} GB`;
  return `Storage limit reached (${gb(used)} used of ${gb(owner.limit)}, this item needs ${gb(incoming)}). Delete items or ask the admin to raise the limit, then refetch.`;
}

async function storeFiles(ctx: WorkerContext, itemId: string, files: readonly FetchedFile[], signal?: AbortSignal) {
  const rows: (typeof media.$inferInsert)[] = [];
  for (const [position, original] of files.entries()) {
    let file = original;
    if (file.type === "video" && (await stat(file.path)).size > ctx.maxVideoBytes) {
      try {
        file = { path: await transcodeVideo(ctx.run, file.path, signal), type: "video", mime: "video/mp4" };
      } catch (error) {
        ctx.log.warn({ err: error, itemId }, "re-encode failed; keeping the original");
      }
    }
    const ext = extensionForContentType(file.mime);
    if (!ext) continue;
    const info = await probeFile(ctx.run, file.path, file.type);
    const sha256 = await sha256File(file.path);
    const key = itemKeys.original(itemId, position, ext);
    await ctx.store.put(key, createReadStream(file.path), { contentType: file.mime, bytes: info.bytes });
    rows.push({ itemId, position, type: file.type, storageKey: key, mime: file.mime, sha256, ...info });
  }
  return rows;
}

/** One `fetch` job (docs/worker-pipeline.md#fetch). */
export async function fetchItem(ctx: WorkerContext, job: FetchJobInfo): Promise<FetchOutcome> {
  const { itemId } = job;
  const [item] = await ctx.db.select().from(items).where(eq(items.id, itemId));
  if (!item) return "skipped"; // deleted meanwhile

  await ctx.db
    .update(items)
    .set({ fetchStatus: "fetching", fetchAttempts: item.fetchAttempts + 1 })
    .where(eq(items.id, itemId));

  const fail = async (errorClass: ErrorClass, message: string, attempts: unknown): Promise<FetchOutcome> => {
    if (errorClass === "retry" && !job.lastAttempt) {
      await ctx.db.update(items).set({ fetchStatus: "pending", fetchError: message }).where(eq(items.id, itemId));
      throw new RetryableFetchError(message);
    }
    await ctx.db
      .update(items)
      .set({
        fetchStatus: "failed",
        fetchError: message,
        rawMeta: { ...(item.rawMeta && typeof item.rawMeta === "object" ? item.rawMeta : {}), attempts },
        ...(errorClass === "gone" ? { availability: "gone" as const, availabilityCheckedAt: new Date() } : {}),
      })
      .where(eq(items.id, itemId));
    if (errorClass === "blocked") await ctx.audit("fetch.blocked", { itemId, reason: message });
    return "failed";
  };

  // 1. expand short links and re-resolve the source
  let url = item.sourceUrl;
  let source = item.source;
  try {
    const parsed = new URL(url);
    if (needsExpansion(parsed, source)) {
      const expanded = await expandUrl(ctx.guard, url);
      url = expanded.url.href;
      const resolved = resolveSource(expanded.url);
      source = resolved.source.id;
      const duplicate = await ctx.db
        .select({ id: items.id, fetchStatus: items.fetchStatus })
        .from(items)
        .where(
          and(
            ne(items.id, itemId),
            // duplicates are per account: two accounts may save the same post
            eq(items.userId, item.userId),
            resolved.sourceItemId
              ? or(eq(items.canonicalUrl, resolved.canonicalUrl), and(eq(items.source, source), eq(items.sourceItemId, resolved.sourceItemId)))
              : eq(items.canonicalUrl, resolved.canonicalUrl),
          ),
        )
        .limit(1);
      const existing = duplicate[0];
      if (existing) {
        await mergeInto(ctx, itemId, existing.id);
        if (existing.fetchStatus === "failed") await ctx.jobs.sendItemJob("fetch", { itemId: existing.id });
        ctx.log.info({ itemId, into: existing.id }, "merged duplicate after expanding link");
        return "merged";
      }
      await ctx.db
        .update(items)
        .set({ canonicalUrl: resolved.canonicalUrl, source, sourceItemId: resolved.sourceItemId ?? item.sourceItemId })
        .where(eq(items.id, itemId));
    }
  } catch (error) {
    if (error instanceof BlockedTargetError) return fail("blocked", errorMessage(error), []);
    // expansion is best effort; the tools follow redirects themselves
    ctx.log.debug({ err: error, itemId }, "link expansion failed");
  }

  ctx.log.info({ itemId, source, url: logUrl(url), attempt: item.fetchAttempts + 1 }, "fetching");

  // 2-4. strategy chain in a private temp dir
  await mkdir(ctx.tmpDir, { recursive: true });
  const tmpDir = await mkdtemp(path.join(ctx.tmpDir, `fetch-${itemId}-`));
  try {
    const fetcher = getFetcher(source);
    const order = strategyOrder(fetcher, url).map((id) => ctx.strategies[id]);
    const outcome = await runChain(order, {
      url,
      tmpDir,
      cookiesFile: await cookiesFor(ctx, source, tmpDir),
      login: loginFor(ctx, source),
      guard: ctx.guard,
      run: ctx.run,
      log: ctx.log,
      maxDownloadBytes: ctx.maxDownloadBytes,
      options: { ...DEFAULT_STRATEGY_OPTIONS, ...fetcher.options },
      ...(job.signal ? { signal: job.signal } : {}),
    });
    if (!outcome.ok) {
      ctx.log.warn({ itemId, source, url: logUrl(url), class: outcome.errorClass, reason: outcome.error }, "fetch failed");
      return await fail(outcome.errorClass, outcome.error, outcome.attempts);
    }

    // 5-6. store media; a refetch that finds no media keeps what was archived before
    const result: FetchResult = outcome.result;
    const files = result.files.length ? result.files : result.preview ? [result.preview] : [];
    const existingMedia = await ctx.db.select({ id: media.id }).from(media).where(eq(media.itemId, itemId));
    let mediaRows: (typeof media.$inferInsert)[] = [];
    if (files.length && (result.files.length || existingMedia.length === 0)) {
      // transcoding only shrinks files, so the downloaded size is a safe upper bound
      const incoming = (await Promise.all(files.map(async (f) => (await stat(f.path)).size))).reduce((a, b) => a + b, 0);
      const over = await quotaError(ctx, item.userId, itemId, incoming);
      if (over) return await fail("fatal", over, outcome.attempts);
      if (existingMedia.length) await ctx.store.deletePrefix(itemKeys.prefix(itemId));
      mediaRows = await storeFiles(ctx, itemId, files, job.signal);
    }

    // 7. metadata
    const caption = result.caption?.trim() || null;
    await ctx.db.transaction(async (tx) => {
      if (mediaRows.length) {
        await tx.delete(media).where(eq(media.itemId, itemId));
        await tx.insert(media).values(mediaRows);
      }
      const kind = result.files.length ? result.kind : existingMedia.length && !mediaRows.length ? item.kind : "link";
      await tx
        .update(items)
        .set({
          kind,
          title: item.title ?? result.title?.trim() ?? (caption ? titleFromCaption(caption) : null),
          caption: caption ?? item.caption,
          authorHandle: result.author?.handle ?? item.authorHandle,
          authorName: result.author?.name ?? item.authorName,
          authorUrl: result.author?.url ?? item.authorUrl,
          postedAt: result.postedAt ?? item.postedAt,
          rawMeta: { strategy: outcome.strategy, attempts: outcome.attempts, meta: result.rawMeta },
          fetchStatus: "ready",
          fetchError: null,
          availability: "available",
          availabilityCheckedAt: new Date(),
        })
        .where(eq(items.id, itemId));
      // the platform id from the tool beats the one parsed from the URL, unless another item owns it
      if (result.sourceItemId && !item.sourceItemId) {
        const taken = await tx
          .select({ id: items.id })
          .from(items)
          .where(and(eq(items.userId, item.userId), eq(items.source, source), eq(items.sourceItemId, result.sourceItemId), ne(items.id, itemId)));
        if (taken.length === 0) await tx.update(items).set({ sourceItemId: result.sourceItemId }).where(eq(items.id, itemId));
      }
    });

    await ctx.jobs.sendItemJob(mediaRows.length || existingMedia.length ? "thumbnail" : "extract", { itemId });
    ctx.log.info(
      { itemId, source, url: logUrl(url), strategy: outcome.strategy, files: mediaRows.length, tried: outcome.attempts.map((a) => a.strategy).join(">") },
      mediaRows.length ? "fetched" : "fetched without media",
    );
    return "ready";
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
