import type { SourceFetcher } from "./types.ts";

export const pinterest: SourceFetcher = {
  id: "pinterest",
  strategies: ["gallery-dl", "yt-dlp", "oembed", "opengraph"],
};
