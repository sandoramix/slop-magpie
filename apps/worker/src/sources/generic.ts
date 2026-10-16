import { looksLikeMedia } from "../strategies/direct.ts";
import type { SourceFetcher } from "./types.ts";

export const generic: SourceFetcher = {
  id: "generic",
  strategies: (url) => (looksLikeMedia(url) ? ["direct", "yt-dlp", "gallery-dl", "opengraph"] : ["yt-dlp", "gallery-dl", "opengraph"]),
};
