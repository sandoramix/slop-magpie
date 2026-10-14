/** Pure, I/O-free description of a site. See docs/sources.md. */
export interface SourceDef {
  /** Stable id stored in `items.source`. */
  readonly id: string;
  readonly label: string;
  readonly hosts: readonly string[];
  match(url: URL): boolean;
  /** Canonical URL used as the dedupe key. */
  normalize(url: URL): string;
  /** Platform id (shortcode etc.) used for dedupe across URL variants. */
  extractId?(url: URL): string | null;
}
