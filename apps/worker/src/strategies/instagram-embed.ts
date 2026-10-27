import { z } from "zod";
import { readLimited, safeFetch } from "../net/ssrf.ts";
import { downloadMedia, HttpStatusError } from "./download.ts";
import { type FetchedFile, type FetchResult, kindOf, type Strategy, type StrategyContext } from "./types.ts";

const SHORTCODE = /instagram\.com\/(?:[^/]+\/)?(?:p|reels?|tv)\/([A-Za-z0-9_-]+)/;
const MAX_HTML_BYTES = 3 * 1024 * 1024;
// the embed page is served to browsers; a phone-like UA gets the lightweight version
const EMBED_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36";

const Node = z.looseObject({
  display_url: z.string().optional(),
  is_video: z.boolean().optional(),
  video_url: z.string().nullish(),
});

const Media = z.looseObject({
  display_url: z.string().optional(),
  is_video: z.boolean().optional(),
  video_url: z.string().nullish(),
  taken_at_timestamp: z.number().optional(),
  owner: z.looseObject({ username: z.string().optional(), full_name: z.string().nullish() }).optional(),
  edge_media_to_caption: z.looseObject({ edges: z.array(z.looseObject({ node: z.looseObject({ text: z.string().optional() }) })) }).optional(),
  edge_sidecar_to_children: z.looseObject({ edges: z.array(z.looseObject({ node: Node })) }).optional(),
});
export type EmbeddedPost = z.infer<typeof Media>;

/** The JSON object that starts at the `{` at `start`, found by counting braces outside of strings. */
function balancedObject(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

function mediaFrom(value: unknown): EmbeddedPost | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const direct = Media.safeParse(record.shortcode_media);
  if (direct.success) return direct.data;
  for (const child of Object.values(record)) {
    const found = mediaFrom(child);
    if (found) return found;
  }
  return null;
}

/**
 * The post out of an Instagram embed page (`/p/<code>/embed/captioned/`), which public posts serve without a
 * login. The data sits in the page in one of two shapes: as `"shortcode_media":{...}` in plain JSON, or inside the
 * escaped string `"contextJSON":"{...}"`. Returns null when neither is there (a private post, or a changed page).
 */
export function parseEmbed(html: string): EmbeddedPost | null {
  const context = /"contextJSON"\s*:\s*("(?:[^"\\]|\\.)*")/.exec(html)?.[1];
  if (context) {
    try {
      const inner: unknown = JSON.parse(JSON.parse(context) as string);
      const found = mediaFrom(inner);
      if (found) return found;
    } catch {
      // fall through to the plain form
    }
  }
  const key = html.indexOf('"shortcode_media"');
  if (key >= 0) {
    const open = html.indexOf("{", key);
    const body = open >= 0 ? balancedObject(html, open) : null;
    if (body) {
      try {
        return mediaFrom({ shortcode_media: JSON.parse(body) as unknown });
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Each picture or video of the post in order; a carousel lists its children, a single post is its own only item. */
export function mediaUrls(post: EmbeddedPost): { url: string; video: boolean }[] {
  const children = post.edge_sidecar_to_children?.edges.map((e) => e.node) ?? [];
  const nodes = children.length ? children : [post];
  return nodes.flatMap((n): { url: string; video: boolean }[] => {
    if (n.is_video && n.video_url) return [{ url: n.video_url, video: true }];
    return n.display_url ? [{ url: n.display_url, video: false }] : [];
  });
}

async function loadPage(ctx: StrategyContext, shortcode: string) {
  const { response, url } = await safeFetch(ctx.guard, `https://www.instagram.com/p/${shortcode}/embed/captioned/`, {
    headers: { "User-Agent": EMBED_UA, Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "Accept-Language": "en-US,en;q=0.8" },
    timeoutMs: 30_000,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new HttpStatusError(response.status, url.href);
  }
  return new TextDecoder().decode(await readLimited(response, MAX_HTML_BYTES));
}

/**
 * Public Instagram posts without a login: every picture of a carousel at full size, plus caption and author, from
 * the embed page. It is the step between the logged-in tools and the OpenGraph preview, so a dead session no
 * longer turns a carousel into one cropped thumbnail. Instagram changes this page now and then; when it does the
 * strategy fails and the chain moves on.
 */
export const instagramEmbed: Strategy = {
  id: "instagram-embed",

  async fetch(ctx): Promise<FetchResult> {
    const shortcode = SHORTCODE.exec(ctx.url)?.[1];
    if (!shortcode) throw new Error("not an Instagram post URL");
    const post = parseEmbed(await loadPage(ctx, shortcode));
    if (!post) throw new Error("the embed page has no post data (private post, or the page changed)");

    const files: FetchedFile[] = [];
    for (const [i, m] of mediaUrls(post).entries()) {
      try {
        files.push(await downloadMedia(ctx, m.url, `ig-embed-${String(i).padStart(2, "0")}`));
      } catch (error) {
        ctx.log.debug({ err: error }, "instagram embed media download failed");
      }
      if (files.length >= ctx.options.maxItems) break;
    }
    const caption = post.edge_media_to_caption?.edges[0]?.node.text?.trim() || undefined;
    const handle = post.owner?.username;
    const name = post.owner?.full_name ?? undefined;
    return {
      kind: kindOf(files),
      sourceItemId: shortcode,
      ...(handle || name ? { author: { ...(handle ? { handle } : {}), ...(name ? { name } : {}) } } : {}),
      ...(caption ? { caption } : {}),
      ...(post.taken_at_timestamp ? { postedAt: new Date(post.taken_at_timestamp * 1000) } : {}),
      files,
      rawMeta: { shortcode, via: "embed", children: post.edge_sidecar_to_children?.edges.length ?? 0, files: files.length },
    };
  },

  async probe(ctx) {
    const shortcode = SHORTCODE.exec(ctx.url)?.[1];
    if (!shortcode) return "unknown";
    try {
      await loadPage(ctx, shortcode);
      return "available";
    } catch (error) {
      return error instanceof HttpStatusError && (error.status === 404 || error.status === 410) ? "gone" : "unknown";
    }
  },
};
