import { z } from "zod";
import { readLimited, safeFetch } from "../net/ssrf.ts";
import { downloadMedia, HttpStatusError } from "./download.ts";
import { type FetchedComment, type FetchedFile, type FetchResult, kindOf, type Strategy, type StrategyContext } from "./types.ts";

const MAX_JSON_BYTES = 8 * 1024 * 1024;
// Reddit rejects generic browser-less clients; say what we are
const REDDIT_UA = "Mozilla/5.0 (compatible; Magpie/1.0; self-hosted archive)";

const Image = z.looseObject({ u: z.string().optional(), gif: z.string().optional(), mp4: z.string().optional() });
const Post = z.looseObject({
  id: z.string().optional(),
  title: z.string().optional(),
  selftext: z.string().optional(),
  author: z.string().optional(),
  created_utc: z.number().optional(),
  url: z.string().optional(),
  post_hint: z.string().optional(),
  is_video: z.boolean().optional(),
  is_gallery: z.boolean().optional(),
  removed_by_category: z.string().nullish(),
  gallery_data: z.looseObject({ items: z.array(z.looseObject({ media_id: z.string() })) }).optional(),
  media_metadata: z.record(z.string(), z.looseObject({ s: Image.optional(), status: z.string().optional() })).optional(),
  preview: z.looseObject({ images: z.array(z.looseObject({ source: z.looseObject({ url: z.string() }) })) }).optional(),
});
type Post = z.infer<typeof Post>;

interface Thing {
  kind?: string | undefined;
  data?: unknown;
}
const Thing: z.ZodType<Thing> = z.looseObject({ kind: z.string().optional(), data: z.unknown() });
const Listing = z.looseObject({ data: z.looseObject({ children: z.array(Thing) }) });
const Page = z.tuple([Listing], Listing);

const Comment = z.looseObject({
  id: z.string().optional(),
  body: z.string().optional(),
  author: z.string().optional(),
  created_utc: z.number().optional(),
  score: z.number().optional(),
  replies: z.unknown().optional(),
});

function findComment(children: readonly Thing[], id: string): FetchedComment | undefined {
  for (const child of children) {
    if (child.kind !== "t1") continue;
    const c = Comment.safeParse(child.data);
    if (!c.success) continue;
    if (c.data.id === id && c.data.body) {
      return {
        id,
        text: c.data.body,
        ...(c.data.author ? { authorHandle: c.data.author } : {}),
        ...(c.data.created_utc ? { postedAt: new Date(c.data.created_utc * 1000) } : {}),
        ...(c.data.score !== undefined ? { likeCount: Math.max(0, c.data.score) } : {}),
      };
    }
    const replies = Listing.safeParse(c.data.replies);
    if (replies.success) {
      const nested = findComment(replies.data.data.children, id);
      if (nested) return nested;
    }
  }
  return undefined;
}

/** `<post url>.json`, rooted at the shared comment when the link names one. */
export function jsonUrl(url: string): string {
  const u = new URL(url);
  u.hostname = u.hostname === "redd.it" ? "www.reddit.com" : u.hostname.replace(/^(old|new|np|m)\./, "www.");
  u.pathname = `${u.pathname.replace(/\/+$/, "")}.json`;
  u.search = "?raw_json=1&limit=200";
  u.hash = "";
  return u.href;
}

async function load(ctx: StrategyContext) {
  const { response, url } = await safeFetch(ctx.guard, jsonUrl(ctx.url), {
    headers: { "User-Agent": REDDIT_UA, Accept: "application/json" },
    timeoutMs: 30_000,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new HttpStatusError(response.status, url.href);
  }
  const page = Page.parse(JSON.parse(new TextDecoder().decode(await readLimited(response, MAX_JSON_BYTES))));
  const postThing = page[0].data.children[0];
  const post = Post.parse(postThing?.data);
  return { post, comments: page[1]?.data.children ?? [] };
}

async function mediaOf(ctx: StrategyContext, post: Post): Promise<{ files: FetchedFile[]; preview?: FetchedFile }> {
  const files: FetchedFile[] = [];
  if (post.is_gallery && post.gallery_data && post.media_metadata) {
    for (const [i, entry] of post.gallery_data.items.entries()) {
      const meta = post.media_metadata[entry.media_id];
      const source = meta?.s?.mp4 ?? meta?.s?.gif ?? meta?.s?.u;
      if (!source || meta?.status === "failed") continue;
      try {
        files.push(await downloadMedia(ctx, source, `reddit-${String(i).padStart(2, "0")}`));
      } catch (error) {
        ctx.log.debug({ err: error }, "reddit gallery image failed");
      }
      if (files.length >= ctx.options.maxItems) break;
    }
    return { files };
  }
  // videos are left to yt-dlp, which merges Reddit's separate audio track
  if (post.is_video) return { files };
  if (post.url && (post.post_hint === "image" || /^https:\/\/(i\.redd\.it|i\.imgur\.com)\//.test(post.url))) {
    try {
      return { files: [await downloadMedia(ctx, post.url, "reddit-image")] };
    } catch (error) {
      ctx.log.debug({ err: error }, "reddit image failed");
    }
  }
  const previewUrl = post.preview?.images[0]?.source.url;
  if (previewUrl) {
    try {
      const preview = await downloadMedia(ctx, previewUrl, "reddit-preview");
      if (preview.type === "image") return { files, preview };
    } catch (error) {
      ctx.log.debug({ err: error }, "reddit preview failed");
    }
  }
  return { files };
}

/**
 * Reddit's own JSON for a post: text posts, image posts, galleries and the shared comment, without a
 * login or an external tool. Videos come out as metadata only so yt-dlp supplies the media.
 */
export const redditJson: Strategy = {
  id: "reddit-json",

  async fetch(ctx): Promise<FetchResult> {
    const { post, comments } = await load(ctx);
    if (post.removed_by_category) throw new HttpStatusError(404, ctx.url);
    const { files, preview } = await mediaOf(ctx, post);
    const comment = ctx.commentId ? findComment(comments, ctx.commentId) : undefined;
    const posted = post.created_utc ? new Date(post.created_utc * 1000) : undefined;
    const author = post.author && post.author !== "[deleted]" ? post.author : undefined;
    const caption = post.selftext && post.selftext !== "[removed]" ? post.selftext : undefined;
    return {
      kind: kindOf(files),
      ...(post.id ? { sourceItemId: post.id } : {}),
      ...(author ? { author: { handle: author, url: `https://www.reddit.com/user/${author}` } } : {}),
      ...(post.title ? { title: post.title } : {}),
      ...(caption ? { caption } : {}),
      ...(posted ? { postedAt: posted } : {}),
      files,
      ...(preview ? { preview } : {}),
      ...(comment ? { comment } : {}),
      rawMeta: { id: post.id, title: post.title, author: post.author, hint: post.post_hint, gallery: post.is_gallery ?? false },
    };
  },

  async probe(ctx) {
    try {
      const { post } = await load(ctx);
      if (post.removed_by_category) return "gone";
      return "available";
    } catch (error) {
      return error instanceof HttpStatusError && (error.status === 404 || error.status === 410) ? "gone" : "unknown";
    }
  },
};
