import type { SourceDef } from "./types.ts";
import { canonicalize, hostMatches } from "./url-utils.ts";

const HOSTS = ["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"];

// /@user/video/<id> and the photo-mode twin /@user/photo/<id>
const POST_PATH = /^\/@([\w.-]+)\/(video|photo)\/(\d{8,})\/?$/;
// vm./vt. links and /t/<code> carry an opaque code; the worker expands them
const SHORT_PATH = /^\/t\/[\w-]+\/?$/;

export const tiktok: SourceDef = {
  id: "tiktok",
  label: "TikTok",
  hosts: HOSTS,
  match: (url) => hostMatches(url, HOSTS),
  extractId: (url) => POST_PATH.exec(url.pathname)?.[3] ?? null,
  needsExpansion: (url) => ["vm.tiktok.com", "vt.tiktok.com"].includes(url.hostname.toLowerCase()) || SHORT_PATH.test(url.pathname),
  normalize(url) {
    const m = POST_PATH.exec(url.pathname);
    if (m) return `https://www.tiktok.com/@${m[1] ?? ""}/${m[2] ?? "video"}/${m[3] ?? ""}`;
    return canonicalize(url, { keepParams: () => false });
  },
};
