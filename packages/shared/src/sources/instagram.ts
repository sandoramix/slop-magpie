import type { SourceDef } from "./types.ts";
import { canonicalize, hostMatches } from "./url-utils.ts";

const HOSTS = ["instagram.com", "www.instagram.com", "m.instagram.com", "instagr.am", "www.instagr.am"];

// /p/<code>, /reel/<code>, /reels/<code>, /tv/<code>, optionally prefixed by /<username>, optionally followed by
// /c/<commentId>[/r/<replyId>] when a comment was shared.
// /share/... links carry an opaque share id, not a shortcode; the worker expands them.
const POST_PATH = /^\/(?:(?!share\/)[\w.]+\/)?(?:p|reels?|tv)\/([\w-]{5,})(?:\/c\/(\d+)(?:\/r\/(\d+))?)?\/?$/;

/** The comment a shared link points at (the reply when there is one), or null for a plain post link. */
function commentIdOf(url: URL): string | null {
  const match = POST_PATH.exec(url.pathname);
  if (!match?.[1]) return null;
  const fromPath = match[3] ?? match[2];
  if (fromPath) return fromPath;
  const fromQuery = url.searchParams.get("reply_comment_id") ?? url.searchParams.get("comment_id");
  return fromQuery && /^\d+$/.test(fromQuery) ? fromQuery : null;
}

export const instagram: SourceDef = {
  id: "instagram",
  label: "Instagram",
  hosts: HOSTS,
  match: (url) => hostMatches(url, HOSTS),
  extractId: (url) => POST_PATH.exec(url.pathname)?.[1] ?? null,
  extractCommentId: commentIdOf,
  needsExpansion: (url) => url.pathname.startsWith("/share/") || ["instagr.am", "www.instagr.am"].includes(url.hostname.toLowerCase()),
  normalize(url) {
    const shortcode = POST_PATH.exec(url.pathname)?.[1];
    if (shortcode) return `https://www.instagram.com/p/${shortcode}`;
    // every Instagram query param is tracking/share noise
    const rest = new URL(url.href);
    rest.hostname = "www.instagram.com";
    return canonicalize(rest, { keepParams: () => false });
  },
};
