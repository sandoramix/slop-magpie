import { direct } from "./direct.ts";
import { galleryDl } from "./gallery-dl.ts";
import { instaloader } from "./instaloader.ts";
import { opengraph } from "./opengraph.ts";
import type { Strategy, StrategyId } from "./types.ts";
import { ytDlp } from "./yt-dlp.ts";

export const strategies: Readonly<Record<StrategyId, Strategy>> = {
  instaloader,
  "yt-dlp": ytDlp,
  "gallery-dl": galleryDl,
  opengraph,
  direct,
};

export * from "./types.ts";
