import type { SourceDef } from "./types.ts";
import { canonicalize, hostMatches } from "./url-utils.ts";

const HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"];

const VIDEO_ID = /^[\w-]{11}$/;
// /shorts/<id>, /live/<id>, /embed/<id>, /v/<id>
const PATH_ID = /^\/(?:shorts|live|embed|v)\/([\w-]{11})\/?$/;

function videoIdOf(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (host === "youtu.be" || host === "www.youtu.be") {
    const id = url.pathname.slice(1).split("/")[0] ?? "";
    return VIDEO_ID.test(id) ? id : null;
  }
  if (url.pathname === "/watch") {
    const v = url.searchParams.get("v");
    return v && VIDEO_ID.test(v) ? v : null;
  }
  return PATH_ID.exec(url.pathname)?.[1] ?? null;
}

export const youtube: SourceDef = {
  id: "youtube",
  label: "YouTube",
  hosts: HOSTS,
  match: (url) => hostMatches(url, HOSTS),
  extractId: videoIdOf,
  normalize(url) {
    const id = videoIdOf(url);
    // a Short and the same video opened as /watch are one item
    if (id) return `https://www.youtube.com/watch?v=${id}`;
    // playlists and channels keep what identifies them
    return canonicalize(url, { keepParams: (name) => name === "list" });
  },
};
