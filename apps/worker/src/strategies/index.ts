import { direct } from "./direct.ts";
import { fxtwitter } from "./fxtwitter.ts";
import { galleryDl } from "./gallery-dl.ts";
import { instagramEmbed } from "./instagram-embed.ts";
import { instaloader } from "./instaloader.ts";
import { oembed } from "./oembed.ts";
import { opengraph } from "./opengraph.ts";
import { redditJson } from "./reddit-json.ts";
import type { Strategy, StrategyId } from "./types.ts";
import { ytDlp } from "./yt-dlp.ts";

export const strategies: Readonly<Record<StrategyId, Strategy>> = {
  instaloader,
  "yt-dlp": ytDlp,
  "gallery-dl": galleryDl,
  opengraph,
  direct,
  oembed,
  "reddit-json": redditJson,
  fxtwitter,
  "instagram-embed": instagramEmbed,
};

export * from "./types.ts";
