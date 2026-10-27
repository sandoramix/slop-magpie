import { z } from "zod";
import { readLimited, safeFetch } from "../net/ssrf.ts";
import { downloadMedia, HttpStatusError } from "./download.ts";
import { type FetchedFile, type FetchResult, kindOf, type Strategy, type StrategyContext, USER_AGENT } from "./types.ts";

const MAX_JSON_BYTES = 2 * 1024 * 1024;

const Media = z.looseObject({ type: z.string(), url: z.string(), thumbnail_url: z.string().optional() });
const Response_ = z.looseObject({
  code: z.number(),
  message: z.string().optional(),
  tweet: z
    .looseObject({
      id: z.string().optional(),
      text: z.string().optional(),
      created_timestamp: z.number().optional(),
      author: z.looseObject({ screen_name: z.string().optional(), name: z.string().optional(), url: z.string().optional() }).optional(),
      media: z.looseObject({ all: z.array(Media).optional() }).optional(),
    })
    .optional(),
});

const STATUS = /^\/(?:([\w]{1,15})|i(?:\/web)?)\/status(?:es)?\/(\d+)/;

/** The relay's API URL for a post link, or null when the link is not a post. */
export function fxApiUrl(url: string): string | null {
  try {
    const m = STATUS.exec(new URL(url).pathname);
    return m?.[2] ? `https://api.fxtwitter.com/${m[1] ?? "i"}/status/${m[2]}` : null;
  } catch {
    return null;
  }
}

async function load(ctx: StrategyContext) {
  const api = fxApiUrl(ctx.url);
  if (!api) throw new Error("not a post link");
  const { response, url } = await safeFetch(ctx.guard, api, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, timeoutMs: 20_000 });
  // the relay answers 404 with a JSON body for deleted or protected posts
  if (!response.ok && response.status !== 404) {
    await response.body?.cancel();
    throw new HttpStatusError(response.status, url.href);
  }
  const body = Response_.parse(JSON.parse(new TextDecoder().decode(await readLimited(response, MAX_JSON_BYTES))));
  if (body.code === 404 || response.status === 404) throw new HttpStatusError(404, url.href);
  if (body.code !== 200 || !body.tweet) throw new HttpStatusError(body.code >= 400 ? body.code : 502, url.href);
  return body.tweet;
}

/**
 * Posts on X without a login, through the public FxTwitter API. A third party sees which posts you save, so
 * this is the last media strategy for `x`, after gallery-dl and yt-dlp (docs/sources.md#x).
 */
export const fxtwitter: Strategy = {
  id: "fxtwitter",

  async fetch(ctx): Promise<FetchResult> {
    const tweet = await load(ctx);
    const files: FetchedFile[] = [];
    for (const [i, m] of (tweet.media?.all ?? []).entries()) {
      try {
        files.push(await downloadMedia(ctx, m.url, `fx-${String(i).padStart(2, "0")}`));
      } catch (error) {
        ctx.log.debug({ err: error }, "fxtwitter media download failed");
      }
      if (files.length >= ctx.options.maxItems) break;
    }
    const handle = tweet.author?.screen_name;
    return {
      kind: kindOf(files),
      ...(tweet.id ? { sourceItemId: tweet.id } : {}),
      ...(handle || tweet.author?.name
        ? { author: { ...(handle ? { handle } : {}), ...(tweet.author?.name ? { name: tweet.author.name } : {}), ...(handle ? { url: `https://x.com/${handle}` } : {}) } }
        : {}),
      ...(tweet.text ? { caption: tweet.text } : {}),
      ...(tweet.created_timestamp ? { postedAt: new Date(tweet.created_timestamp * 1000) } : {}),
      files,
      rawMeta: { id: tweet.id, author: handle, media: tweet.media?.all?.map((m) => m.type) ?? [] },
    };
  },

  async probe(ctx) {
    try {
      await load(ctx);
      return "available";
    } catch (error) {
      return error instanceof HttpStatusError && (error.status === 404 || error.status === 410) ? "gone" : "unknown";
    }
  },
};
