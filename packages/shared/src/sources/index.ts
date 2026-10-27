import { facebook } from "./facebook.ts";
import { generic } from "./generic.ts";
import { instagram } from "./instagram.ts";
import { pinterest } from "./pinterest.ts";
import { reddit } from "./reddit.ts";
import { tiktok } from "./tiktok.ts";
import type { SourceDef } from "./types.ts";
import { x } from "./x.ts";
import { youtube } from "./youtube.ts";

export type { SourceDef } from "./types.ts";
export { canonicalize, isTrackingParam } from "./url-utils.ts";

/**
 * Every source with working code, in match order. All are used for matching except those an operator listed
 * in `DISABLED_SOURCES`, which save as `generic` (docs/sources.md#disabling-a-source). `generic` is the
 * fallback and is not in this list.
 */
export const knownSources: readonly SourceDef[] = [instagram, tiktok, youtube, pinterest, x, reddit, facebook];

export const knownSourceIds: readonly string[] = knownSources.map((s) => s.id);

/** Every source is on unless an operator lists it in `DISABLED_SOURCES`. */
export const DEFAULT_ENABLED_SOURCES: readonly string[] = knownSourceIds;

export const allSources: readonly SourceDef[] = [...knownSources, generic];

export const GENERIC_SOURCE_ID = generic.id;

export function getSource(id: string): SourceDef | undefined {
  return allSources.find((s) => s.id === id);
}

export function isSourceId(id: string): boolean {
  return getSource(id) !== undefined;
}

/** Ids from a comma list (`DISABLED_SOURCES`), keeping only known ones. */
export function parseSourceIds(list: string): string[] {
  const wanted = list.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return knownSourceIds.filter((id) => wanted.includes(id));
}

/** The sources left on once the blacklist is applied. */
export function enabledSourcesWithout(disabled: readonly string[]): string[] {
  return knownSourceIds.filter((id) => !disabled.includes(id));
}

export interface ResolvedSource {
  source: SourceDef;
  canonicalUrl: string;
  sourceItemId: string | null;
  /** Set when the link points at a comment on the post. */
  commentId: string | null;
}

export function resolveSource(url: URL, enabled: readonly string[] = DEFAULT_ENABLED_SOURCES): ResolvedSource {
  const source = knownSources.find((s) => enabled.includes(s.id) && s.match(url)) ?? generic;
  return {
    source,
    canonicalUrl: source.normalize(url),
    sourceItemId: source.extractId?.(url) ?? null,
    commentId: source.extractCommentId?.(url) ?? null,
  };
}

/** True when the link is a shortener or opaque share link that must be followed to find the post. */
export function needsExpansion(url: URL): boolean {
  return knownSources.some((s) => s.match(url) && s.needsExpansion?.(url));
}
