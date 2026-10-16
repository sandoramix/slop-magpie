import { Readable } from "node:stream";
import { BlobNotFoundError, type BlobRange, InvalidKeyError, InvalidRangeError, verifyMediaSignature } from "@magpie/storage";
import { Hono } from "hono";
import type { AppDeps } from "../deps.ts";
import { errorResponse } from "../http/errors.ts";

/** `bytes=a-b`, `bytes=a-`, `bytes=-n` (single range only). Null = ignore the header. */
export function parseRange(header: string | undefined, size: number): BlobRange | "invalid" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, a = "", b = ""] = m;
  if (a === "" && b === "") return "invalid";
  if (a === "") {
    const n = Number(b);
    if (n === 0) return "invalid";
    return { start: Math.max(0, size - n) };
  }
  const start = Number(a);
  const end = b === "" ? undefined : Number(b);
  if (start >= size || (end !== undefined && end < start)) return "invalid";
  return end === undefined ? { start } : { start, end };
}

/** HMAC-signed media, no bearer token (docs/storage.md). */
export const mediaRoutes = (deps: AppDeps) =>
  new Hono().get("/:key{.+}", async (c) => {
    // keys are plain [A-Za-z0-9._-/] (validated by the store), so decoding cannot smuggle anything
    const key = c.req.param("key");
    const exp = Number(c.req.query("exp"));
    const sig = c.req.query("sig") ?? "";
    const now = Math.floor(Date.now() / 1000);
    if (!verifyMediaSignature(deps.mediaSigningSecret, key, exp, sig, now)) {
      return errorResponse(c, 403, "unauthorized", "Invalid or expired signature");
    }

    try {
      const head = await deps.store.head(key);
      if (!head) return errorResponse(c, 404, "not_found", "Not found");
      const range = parseRange(c.req.header("range"), head.bytes);
      const headers: Record<string, string> = {
        "Content-Type": head.contentType,
        "Accept-Ranges": "bytes",
        "Cache-Control": `private, max-age=${Math.max(0, exp - now)}`,
      };
      if (range === "invalid") {
        return c.body(null, 416, { ...headers, "Content-Range": `bytes */${head.bytes}` });
      }
      const blob = await deps.store.get(key, range ?? undefined);
      if (c.req.method === "HEAD") blob.body.destroy();
      const body = c.req.method === "HEAD" ? "" : (Readable.toWeb(blob.body) as ReadableStream<Uint8Array>);
      if (blob.range) {
        const { start, end } = blob.range;
        return c.body(body, 206, {
          ...headers,
          "Content-Range": `bytes ${start}-${end}/${head.bytes}`,
          "Content-Length": String(end - start + 1),
        });
      }
      return c.body(body, 200, { ...headers, "Content-Length": String(head.bytes) });
    } catch (error) {
      if (error instanceof BlobNotFoundError || error instanceof InvalidKeyError) {
        return errorResponse(c, 404, "not_found", "Not found");
      }
      if (error instanceof InvalidRangeError) {
        return c.body(null, 416, { "Content-Range": `bytes */${error.size}` });
      }
      throw error;
    }
  });
