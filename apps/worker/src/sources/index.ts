import { facebook } from "./facebook.ts";
import { generic } from "./generic.ts";
import { instagram } from "./instagram.ts";
import { pinterest } from "./pinterest.ts";
import { reddit } from "./reddit.ts";
import { tiktok } from "./tiktok.ts";
import type { SourceFetcher } from "./types.ts";
import { x } from "./x.ts";
import { youtube } from "./youtube.ts";

export type { SourceFetcher } from "./types.ts";

const fetchers: readonly SourceFetcher[] = [instagram, tiktok, youtube, pinterest, x, reddit, facebook, generic];

/** Fetcher for a registry id; unknown ids fall back to `generic`. */
export function getFetcher(sourceId: string): SourceFetcher {
  return fetchers.find((f) => f.id === sourceId) ?? generic;
}

export function strategyOrder(fetcher: SourceFetcher, url: string) {
  return typeof fetcher.strategies === "function" ? fetcher.strategies(url) : fetcher.strategies;
}

export const sourceFetcherIds = fetchers.map((f) => f.id);
