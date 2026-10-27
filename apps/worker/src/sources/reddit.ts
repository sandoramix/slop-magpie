import type { SourceFetcher } from "./types.ts";

// reddit-json reads text, images, galleries and the shared comment; for videos it only supplies metadata so yt-dlp delivers the media
export const reddit: SourceFetcher = {
  id: "reddit",
  strategies: ["reddit-json", "yt-dlp", "gallery-dl", "oembed", "opengraph"],
};
