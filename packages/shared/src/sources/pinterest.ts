import type { SourceDef } from "./types.ts";
import { canonicalize } from "./url-utils.ts";

// pinterest.com and its country sites (pinterest.co.uk, pinterest.fr, ...), plus the pin.it shortener
const HOST = /^(?:[\w-]+\.)*pinterest\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/;

// /pin/<id> or /pin/<slug>--<id>
const PIN_PATH = /^\/pin\/(?:[\w%-]+--)?(\d{6,})\/?$/;

export const pinterest: SourceDef = {
  id: "pinterest",
  label: "Pinterest",
  hosts: ["pinterest.com", "www.pinterest.com", "pin.it"],
  match: (url) => {
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    return host === "pin.it" || HOST.test(host);
  },
  extractId: (url) => PIN_PATH.exec(url.pathname)?.[1] ?? null,
  needsExpansion: (url) => url.hostname.toLowerCase() === "pin.it",
  normalize(url) {
    const id = PIN_PATH.exec(url.pathname)?.[1];
    if (id) return `https://www.pinterest.com/pin/${id}`;
    const rest = new URL(url.href);
    if (/(^|\.)pinterest\./.test(rest.hostname)) rest.hostname = "www.pinterest.com";
    return canonicalize(rest, { keepParams: () => false });
  },
};
