import { z } from "zod";
import { readLimited, safeFetch } from "../net/ssrf.ts";
import { downloadMedia, HttpStatusError } from "./download.ts";
import { decodeEntities } from "./html-meta.ts";
import { type FetchedFile, type FetchResult, type Strategy, type StrategyContext, USER_AGENT } from "./types.ts";

const MAX_JSON_BYTES = 1024 * 1024;

/** Sites that publish an oEmbed endpoint; it answers without a login and survives when the media extractors are blocked. */
const PROVIDERS: { host: RegExp; endpoint: (url: string) => string }[] = [
  { host: /(^|\.)youtube\.com$|^youtu\.be$/, endpoint: (u) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u)}` },
  { host: /(^|\.)tiktok\.com$/, endpoint: (u) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(u)}` },
  { host: /(^|\.)(x|twitter)\.com$/, endpoint: (u) => `https://publish.twitter.com/oembed?omit_script=1&url=${encodeURIComponent(u)}` },
  { host: /(^|\.)reddit\.com$|^redd\.it$/, endpoint: (u) => `https://www.reddit.com/oembed?url=${encodeURIComponent(u)}` },
  { host: /(^|\.)pinterest\.[a-z.]+$|^pin\.it$/, endpoint: (u) => `https://widgets.pinterest.com/oembed.json?url=${encodeURIComponent(u)}` },
  { host: /(^|\.)vimeo\.com$/, endpoint: (u) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(u)}` },
];

const OEmbed = z.looseObject({
  title: z.string().optional(),
  author_name: z.string().optional(),
  author_url: z.string().optional(),
  provider_name: z.string().optional(),
  thumbnail_url: z.string().optional(),
  html: z.string().optional(),
});

export function oembedEndpoint(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return PROVIDERS.find((p) => p.host.test(host))?.endpoint(url) ?? null;
  } catch {
    return null;
  }
}

/** Embed HTML to plain text (tweet embeds carry the tweet text in a blockquote). */
export function textFromEmbedHtml(html: string): string | undefined {
  const text = decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return text || undefined;
}

async function getJson(ctx: StrategyContext, endpoint: string) {
  const { response, url } = await safeFetch(ctx.guard, endpoint, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    timeoutMs: 20_000,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new HttpStatusError(response.status, url.href);
  }
  return JSON.parse(new TextDecoder().decode(await readLimited(response, MAX_JSON_BYTES))) as unknown;
}

/**
 * Title, author and thumbnail from the site's oEmbed endpoint. Never yields video, so it is a metadata
 * fallback: the item becomes a `link` with a preview image.
 */
export const oembed: Strategy = {
  id: "oembed",

  async fetch(ctx): Promise<FetchResult> {
    const endpoint = oembedEndpoint(ctx.url);
    if (!endpoint) throw new Error("no oEmbed endpoint for this site");
    const data = OEmbed.parse(await getJson(ctx, endpoint));

    let preview: FetchedFile | undefined;
    if (data.thumbnail_url) {
      try {
        const file = await downloadMedia(ctx, data.thumbnail_url, "oembed-thumb");
        if (file.type === "image") preview = file;
      } catch (error) {
        ctx.log.debug({ err: error }, "oEmbed thumbnail download failed");
      }
    }
    const caption = data.html ? textFromEmbedHtml(data.html) : undefined;
    return {
      kind: "link",
      ...(data.title ? { title: data.title } : {}),
      // a tweet's title is only "<name> on X"; its text is the useful part
      ...(caption && !data.title ? { caption } : caption && /^.{1,80} on (X|Twitter)$/i.test(data.title ?? "") ? { caption } : {}),
      ...(data.author_name || data.author_url
        ? { author: { ...(data.author_name ? { name: data.author_name } : {}), ...(data.author_url ? { url: data.author_url } : {}) } }
        : {}),
      files: [],
      ...(preview ? { preview } : {}),
      rawMeta: { provider: data.provider_name, title: data.title, author: data.author_name },
    };
  },

  async probe(ctx) {
    const endpoint = oembedEndpoint(ctx.url);
    if (!endpoint) return "unknown";
    try {
      await getJson(ctx, endpoint);
      return "available";
    } catch (error) {
      // 404/410 mean removed; providers answer 401/403 for private or embed-disabled posts, which proves nothing
      return error instanceof HttpStatusError && (error.status === 404 || error.status === 410) ? "gone" : "unknown";
    }
  },
};
