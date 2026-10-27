import type { SourceDef } from "./types.ts";
import { canonicalize, hostMatches } from "./url-utils.ts";

const HOSTS = ["reddit.com", "www.reddit.com", "old.reddit.com", "new.reddit.com", "np.reddit.com", "m.reddit.com", "redd.it"];

// /r/<sub>/comments/<id>[/<slug>[/<commentId>]] or /comments/<id>...
const POST_PATH = /^\/(?:r\/([\w]+)\/)?comments\/([a-z0-9]{5,8})(?:\/[^/]*)?(?:\/([a-z0-9]{6,8}))?\/?$/i;
// /r/<sub>/s/<code> share links are opaque; the worker expands them
const SHARE_PATH = /^\/r\/[\w]+\/s\/[\w-]+\/?$/;

function isShort(url: URL): boolean {
  return url.hostname.toLowerCase() === "redd.it";
}

export const reddit: SourceDef = {
  id: "reddit",
  label: "Reddit",
  hosts: HOSTS,
  match: (url) => hostMatches(url, HOSTS),
  // redd.it/<id> is the post id itself
  extractId: (url) => (isShort(url) ? (/^\/([a-z0-9]{5,8})\/?$/i.exec(url.pathname)?.[1] ?? null) : (POST_PATH.exec(url.pathname)?.[2] ?? null)),
  extractCommentId: (url) => (isShort(url) ? null : (POST_PATH.exec(url.pathname)?.[3] ?? null)),
  needsExpansion: (url) => SHARE_PATH.test(url.pathname),
  normalize(url) {
    const id = isShort(url) ? /^\/([a-z0-9]{5,8})\/?$/i.exec(url.pathname)?.[1] : POST_PATH.exec(url.pathname)?.[2];
    if (id) {
      const sub = isShort(url) ? undefined : POST_PATH.exec(url.pathname)?.[1];
      return sub ? `https://www.reddit.com/r/${sub}/comments/${id}` : `https://www.reddit.com/comments/${id}`;
    }
    const rest = new URL(url.href);
    if (!isShort(url)) rest.hostname = "www.reddit.com";
    return canonicalize(rest, { keepParams: () => false });
  },
};
