import { generic } from "./generic.ts";
import { instagram } from "./instagram.ts";
import type { SourceDef } from "./types.ts";

export type { SourceDef } from "./types.ts";
export { canonicalize, isTrackingParam } from "./url-utils.ts";

/** Specific sources, matched in order. `generic` is the fallback and is not in this list. */
export const sources: readonly SourceDef[] = [instagram];

export const allSources: readonly SourceDef[] = [...sources, generic];

export const GENERIC_SOURCE_ID = generic.id;

export function getSource(id: string): SourceDef | undefined {
  return allSources.find((s) => s.id === id);
}

export function isSourceId(id: string): boolean {
  return getSource(id) !== undefined;
}

export interface ResolvedSource {
  source: SourceDef;
  canonicalUrl: string;
  sourceItemId: string | null;
}

export function resolveSource(url: URL): ResolvedSource {
  const source = sources.find((s) => s.match(url)) ?? generic;
  return {
    source,
    canonicalUrl: source.normalize(url),
    sourceItemId: source.extractId?.(url) ?? null,
  };
}
