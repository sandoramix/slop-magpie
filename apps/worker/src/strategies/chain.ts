import { BlockedTargetError } from "../net/ssrf.ts";
import { classifyError, type ErrorClass, errorMessage, logUrl } from "./errors.ts";
import type { FetchResult, Strategy, StrategyContext, StrategyId } from "./types.ts";

export interface Attempt {
  strategy: StrategyId;
  ok: boolean;
  files?: number;
  error?: string;
  class?: ErrorClass;
}

export type ChainOutcome =
  | { ok: true; result: FetchResult; strategy: StrategyId; attempts: Attempt[] }
  | { ok: false; errorClass: ErrorClass; error: string; attempts: Attempt[] };

const metadataScore = (r: FetchResult) =>
  (r.title ? 2 : 0) + (r.caption ? 2 : 0) + (r.preview ? 3 : 0) + (r.author?.handle || r.author?.name ? 1 : 0) + (r.postedAt ? 1 : 0);

/**
 * Tries strategies in order; the first with at least one media file wins. Without media, the
 * richest metadata-only result is kept (the item becomes a `link`).
 */
export async function runChain(order: readonly Strategy[], ctx: StrategyContext): Promise<ChainOutcome> {
  const attempts: Attempt[] = [];
  let best: { result: FetchResult; strategy: StrategyId } | null = null;
  const errors: { strategy: StrategyId; class: ErrorClass; message: string }[] = [];

  for (const strategy of order) {
    try {
      const result = await strategy.fetch(ctx);
      attempts.push({ strategy: strategy.id, ok: true, files: result.files.length });
      if (result.files.length > 0) return { ok: true, result, strategy: strategy.id, attempts };
      ctx.log.warn({ url: logUrl(ctx.url), metadata: metadataScore(result) }, `${strategy.id} found no media`);
      errors.push({ strategy: strategy.id, class: "fatal", message: "no media found" });
      if (!best || metadataScore(result) > metadataScore(best.result)) best = { result, strategy: strategy.id };
    } catch (error) {
      // a blocked target is final: no other strategy may touch it either
      if (error instanceof BlockedTargetError && error.reason !== "too_large") {
        attempts.push({ strategy: strategy.id, ok: false, error: errorMessage(error), class: "blocked" });
        return { ok: false, errorClass: "blocked", error: errorMessage(error), attempts };
      }
      const cls = classifyError(error);
      attempts.push({ strategy: strategy.id, ok: false, error: errorMessage(error), class: cls });
      errors.push({ strategy: strategy.id, class: cls, message: errorMessage(error) });
      ctx.log.warn({ url: logUrl(ctx.url), class: cls, reason: errorMessage(error) }, `${strategy.id} failed`);
    }
  }

  if (best && metadataScore(best.result) > 0) return { ok: true, ...best, attempts };
  // transient beats gone (Instagram reports rate limits as "not available"), gone beats fatal
  const errorClass: ErrorClass = errors.some((e) => e.class === "retry") ? "retry" : errors.some((e) => e.class === "gone") ? "gone" : "fatal";
  // every strategy's error: the first alone (e.g. yt-dlp's "no video in this post") hides why the fallback failed
  const error = errors.length ? errors.map((e) => `${e.strategy}: ${e.message}`).join(" | ").slice(0, 1000) : "no strategy returned anything";
  return { ok: false, errorClass, error, attempts };
}
