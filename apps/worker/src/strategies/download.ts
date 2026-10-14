import { createWriteStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { contentTypeForKey, extensionForContentType } from "@magpie/storage";
import { BlockedTargetError, safeFetch } from "../net/ssrf.ts";
import type { FetchedFile, StrategyContext } from "./types.ts";
import { USER_AGENT } from "./types.ts";

export class HttpStatusError extends Error {
  override name = "HttpStatusError";
  readonly status: number;
  constructor(status: number, url: string) {
    super(`HTTP ${status} for ${new URL(url).host}`);
    this.status = status;
  }
}

/** Media type from a content type or, failing that, the URL's extension. */
export function mediaTypeOf(contentType: string | null, url: string): { type: "video" | "image"; mime: string; ext: string } | null {
  const mime = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  const fromHeader = extensionForContentType(mime);
  const ext = fromHeader ?? new URL(url).pathname.split(".").pop()?.toLowerCase() ?? "";
  const resolved = contentTypeForKey(`x.${ext}`);
  if (!resolved) return null;
  return { type: resolved.startsWith("video/") ? "video" : "image", mime: resolved, ext };
}

/** Downloads a URL through the SSRF guard into `ctx.tmpDir/<name>.<ext>`, size-capped. */
export async function downloadMedia(ctx: StrategyContext, url: string, name: string): Promise<FetchedFile> {
  const { response, url: finalUrl } = await safeFetch(ctx.guard, url, {
    headers: { "User-Agent": USER_AGENT, ...ctx.options.headers },
    timeoutMs: 5 * 60_000,
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new HttpStatusError(response.status, finalUrl.href);
  }
  const type = mediaTypeOf(response.headers.get("content-type"), finalUrl.href);
  if (!type) {
    await response.body.cancel();
    throw new Error(`not a supported media type: ${response.headers.get("content-type") ?? "unknown"}`);
  }
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > ctx.maxDownloadBytes) {
    await response.body.cancel();
    throw new BlockedTargetError("too_large", `media larger than ${ctx.maxDownloadBytes} bytes`);
  }
  const file = path.join(ctx.tmpDir, `${name}.${type.ext}`);
  let total = 0;
  const max = ctx.maxDownloadBytes;
  // undici's web stream; cap while streaming since content-length can lie
  const body = Readable.fromWeb(response.body);
  body.on("data", (chunk: Buffer) => {
    total += chunk.length;
    if (total > max) body.destroy(new BlockedTargetError("too_large", `media larger than ${max} bytes`));
  });
  await pipeline(body, createWriteStream(file));
  return { path: file, type: type.type, mime: type.mime };
}
