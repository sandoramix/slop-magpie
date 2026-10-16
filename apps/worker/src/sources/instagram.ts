import type { SourceFetcher } from "./types.ts";

export const instagram: SourceFetcher = {
  id: "instagram",
  // reels/videos via yt-dlp; image posts and carousels (where yt-dlp finds no video) via gallery-dl
  strategies: ["yt-dlp", "gallery-dl"],
};
