import type { SourceDef } from "./types.ts";
import { canonicalize, hostMatches } from "./url-utils.ts";

// fxtwitter and friends are how people paste embeds into chats; they all point at the same post
const HOSTS = [
  "x.com",
  "www.x.com",
  "mobile.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
  "fxtwitter.com",
  "vxtwitter.com",
  "fixupx.com",
  "fixvx.com",
];

// /<user>/status/<id>[/photo/1|/video/1], or /i/web/status/<id> and /i/status/<id>
const STATUS_PATH = /^\/(?:i\/(?:web\/)?|([\w]{1,15})\/)status(?:es)?\/(\d{5,})(?:\/.*)?$/;

export const x: SourceDef = {
  id: "x",
  label: "X",
  hosts: HOSTS,
  match: (url) => hostMatches(url, HOSTS),
  extractId: (url) => STATUS_PATH.exec(url.pathname)?.[2] ?? null,
  normalize(url) {
    const m = STATUS_PATH.exec(url.pathname);
    if (m?.[2]) return `https://x.com/${m[1] ?? "i"}/status/${m[2]}`;
    const rest = new URL(url.href);
    rest.hostname = "x.com";
    return canonicalize(rest, { keepParams: () => false });
  },
};
