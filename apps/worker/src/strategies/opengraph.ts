import { readLimited, safeFetch } from "../net/ssrf.ts";
import { downloadMedia, HttpStatusError, mediaTypeOf } from "./download.ts";
import { parsePageMeta } from "./html-meta.ts";
import { type FetchedFile, type FetchResult, type Strategy, type StrategyContext, USER_AGENT } from "./types.ts";

const MAX_HTML_BYTES = 3 * 1024 * 1024;

async function getPage(ctx: StrategyContext, method: "GET" | "HEAD" = "GET") {
  return safeFetch(ctx.guard, ctx.url, {
    method,
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", ...ctx.options.headers },
    timeoutMs: 30_000,
  });
}

export const opengraph: Strategy = {
  id: "opengraph",

  async fetch(ctx): Promise<FetchResult> {
    const { response, url } = await getPage(ctx);
    if (!response.ok) {
      await response.body?.cancel();
      throw new HttpStatusError(response.status, url.href);
    }
    const contentType = response.headers.get("content-type") ?? "";
    // the "page" is itself a media file
    if (!/html|xml/i.test(contentType) && mediaTypeOf(contentType, url.href)) {
      await response.body?.cancel();
      const file = await downloadMedia(ctx, url.href, "og-direct");
      return { kind: file.type === "video" ? "video" : "image", files: [file], rawMeta: { url: url.href, contentType } };
    }
    const html = new TextDecoder().decode(await readLimited(response, MAX_HTML_BYTES));
    const meta = parsePageMeta(html, url.href);

    const files: FetchedFile[] = [];
    let preview: FetchedFile | undefined;
    if (meta.video && (!meta.videoType || /video\/(mp4|webm|quicktime)/i.test(meta.videoType))) {
      try {
        const file = await downloadMedia(ctx, meta.video, "og-video");
        if (file.type === "video") files.push(file);
      } catch (error) {
        ctx.log.debug({ err: error }, "og:video download failed");
      }
    }
    if (meta.image) {
      try {
        const file = await downloadMedia(ctx, meta.image, "og-image");
        if (file.type === "image") preview = file;
      } catch (error) {
        ctx.log.debug({ err: error }, "og:image download failed");
      }
    }
    const posted = meta.publishedAt ? new Date(meta.publishedAt) : undefined;
    const caption = meta.description;
    return {
      kind: files.length ? "video" : "link",
      ...(meta.title ? { title: meta.title } : {}),
      ...(caption ? { caption } : {}),
      ...(meta.author || meta.siteName ? { author: { ...(meta.author ? { name: meta.author } : meta.siteName ? { name: meta.siteName } : {}) } } : {}),
      ...(posted && !Number.isNaN(posted.getTime()) ? { postedAt: posted } : {}),
      files,
      ...(preview ? { preview } : {}),
      rawMeta: { ...meta, finalUrl: url.href },
    };
  },

  async probe(ctx) {
    try {
      let { response } = await getPage(ctx, "HEAD");
      if (response.status === 405 || response.status === 403) ({ response } = await getPage(ctx, "GET"));
      await response.body?.cancel();
      if (response.ok) return "available";
      return response.status === 404 || response.status === 410 ? "gone" : "unknown";
    } catch {
      return "unknown";
    }
  },
};
