import type { SourceFetcher } from "./types.ts";

export const youtube: SourceFetcher = {
  id: "youtube",
  strategies: ["yt-dlp", "oembed", "opengraph"],
  // a link with &list= must not pull a whole playlist
  options: { maxItems: 1 },
};
