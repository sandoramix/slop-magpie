import type { SourceFetcher } from "./types.ts";

// photo-mode posts have no video, so gallery-dl follows yt-dlp; oEmbed keeps title and thumbnail when both are blocked
export const tiktok: SourceFetcher = {
  id: "tiktok",
  strategies: ["yt-dlp", "gallery-dl", "oembed", "opengraph"],
};
