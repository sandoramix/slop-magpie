import type { SourceFetcher } from "./types.ts";

// fxtwitter goes through a third-party relay, so it comes after the tools that talk to X directly
export const x: SourceFetcher = {
  id: "x",
  strategies: ["gallery-dl", "yt-dlp", "fxtwitter", "oembed", "opengraph"],
};
