import type { SourceFetcher } from "./types.ts";

export const instagram: SourceFetcher = {
  id: "instagram",
  // reels/videos via yt-dlp; image posts and carousels (where yt-dlp finds no video) via gallery-dl;
  // opengraph last so a post the tools cannot read still keeps its preview image and caption
  strategies: ["yt-dlp", "gallery-dl", "opengraph"],
};
