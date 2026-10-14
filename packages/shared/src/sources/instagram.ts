import type { SourceDef } from "./types.ts";
import { canonicalize, hostMatches } from "./url-utils.ts";

const HOSTS = ["instagram.com", "www.instagram.com", "m.instagram.com", "instagr.am", "www.instagr.am"];

// /p/<code>, /reel/<code>, /reels/<code>, /tv/<code>, optionally prefixed by /<username>.
// /share/... links carry an opaque share id, not a shortcode; the worker expands them.
const POST_PATH = /^\/(?:(?!share\/)[\w.]+\/)?(?:p|reels?|tv)\/([\w-]{5,})\/?$/;

export const instagram: SourceDef = {
  id: "instagram",
  label: "Instagram",
  hosts: HOSTS,
  match: (url) => hostMatches(url, HOSTS),
  extractId: (url) => POST_PATH.exec(url.pathname)?.[1] ?? null,
  normalize(url) {
    const shortcode = POST_PATH.exec(url.pathname)?.[1];
    if (shortcode) return `https://www.instagram.com/p/${shortcode}`;
    // every Instagram query param is tracking/share noise
    const rest = new URL(url.href);
    rest.hostname = "www.instagram.com";
    return canonicalize(rest, { keepParams: () => false });
  },
};
