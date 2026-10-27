import type { SourceDef } from "./types.ts";
import { canonicalize, hostMatches } from "./url-utils.ts";

const HOSTS = ["facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com", "mbasic.facebook.com", "fb.watch", "fb.com", "www.fb.com"];

const REEL_PATH = /^\/reel\/(\d{6,})\/?$/;
const VIDEOS_PATH = /^\/(?:[\w.-]+\/)?videos\/(?:[\w.-]+\/)?(\d{6,})\/?$/;
// /share/v|r|p/<code> are opaque and expanded by the worker
const SHARE_PATH = /^\/share\/(?:[vrp]\/)?[\w-]+\/?$/;
const KEEP = new Set(["v", "fbid", "story_fbid", "id", "set"]);

function idOf(url: URL): string | null {
  const reel = REEL_PATH.exec(url.pathname)?.[1];
  if (reel) return reel;
  if (url.pathname.replace(/\/$/, "") === "/watch") {
    const v = url.searchParams.get("v");
    return v && /^\d{6,}$/.test(v) ? v : null;
  }
  const video = VIDEOS_PATH.exec(url.pathname)?.[1];
  if (video) return video;
  if (url.pathname === "/photo.php" || url.pathname === "/photo") return url.searchParams.get("fbid");
  return url.searchParams.get("story_fbid");
}

export const facebook: SourceDef = {
  id: "facebook",
  label: "Facebook",
  hosts: HOSTS,
  match: (url) => hostMatches(url, HOSTS),
  extractId: idOf,
  needsExpansion: (url) => url.hostname.toLowerCase() === "fb.watch" || SHARE_PATH.test(url.pathname),
  normalize(url) {
    const reel = REEL_PATH.exec(url.pathname)?.[1];
    if (reel) return `https://www.facebook.com/reel/${reel}`;
    const rest = new URL(url.href);
    if (rest.hostname !== "fb.watch") rest.hostname = "www.facebook.com";
    return canonicalize(rest, { keepParams: (name) => KEEP.has(name) });
  },
};
