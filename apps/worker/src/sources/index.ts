import { generic } from "./generic.ts";
import { instagram } from "./instagram.ts";
import type { SourceFetcher } from "./types.ts";

export type { SourceFetcher } from "./types.ts";

const fetchers: readonly SourceFetcher[] = [instagram, generic];

/** Fetcher for a registry id; unknown ids fall back to `generic`. */
export function getFetcher(sourceId: string): SourceFetcher {
  return fetchers.find((f) => f.id === sourceId) ?? generic;
}

export function strategyOrder(fetcher: SourceFetcher, url: string) {
  return typeof fetcher.strategies === "function" ? fetcher.strategies(url) : fetcher.strategies;
}

export const sourceFetcherIds = fetchers.map((f) => f.id);
