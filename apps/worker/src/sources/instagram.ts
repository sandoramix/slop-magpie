import type { SourceFetcher } from "./types.ts";

export const instagram: SourceFetcher = {
  id: "instagram",
  // instaloader keeps its own logged-in session (INSTAGRAM_USERNAME / INSTAGRAM_PASSWORD) and covers posts, carousels
  // and reels; without credentials it steps aside for yt-dlp (reels) and gallery-dl (posts) with the manual cookie file
  strategies: ["instaloader", "yt-dlp", "gallery-dl"],
};
