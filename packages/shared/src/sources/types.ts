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
  /** Id of the comment a shared link points at, when the link is to a comment on a post. */
  extractCommentId?(url: URL): string | null;
  /** Shortener or opaque share link whose real post is only known after following redirects (done by the worker). */
  needsExpansion?(url: URL): boolean;
}
