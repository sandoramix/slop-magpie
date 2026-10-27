import type { Logger } from "../logger.ts";
import type { Guard } from "../net/ssrf.ts";
import type { Runner } from "../tools/run.ts";

export const strategyIds = ["instaloader", "yt-dlp", "gallery-dl", "opengraph", "direct", "oembed", "reddit-json", "fxtwitter", "instagram-embed"] as const;
export type StrategyId = (typeof strategyIds)[number];

export interface FetchedFile {
  path: string;
  type: "video" | "image";
  mime: string;
}

export interface FetchedComment {
  id: string;
  text: string;
  authorHandle?: string;
  postedAt?: Date;
  likeCount?: number;
}

/** Normalized output of every strategy (docs/sources.md). */
export interface FetchResult {
  kind: "video" | "image" | "gallery" | "link";
  sourceItemId?: string;
  author?: { handle?: string; name?: string; url?: string };
  title?: string;
  caption?: string;
  postedAt?: Date;
  files: FetchedFile[];
  /** The comment the saved link pointed at (`StrategyContext.commentId`), when the strategy could read it. */
  comment?: FetchedComment;
  /** Preview image for `link` items (og:image etc.), stored as the item's only media. */
  preview?: FetchedFile;
  /** Trimmed tool output, stored in `items.raw_meta`. */
  rawMeta: unknown;
}

export interface StrategyOptions {
  /** yt-dlp format sort (`-S`). */
  ytdlpFormatSort: string;
  /** Extra HTTP headers for our own requests (opengraph/direct/gallery-dl downloads). */
  headers: Record<string, string>;
  maxItems: number;
  /** User-Agent for the opengraph page request only, e.g. a link-preview crawler that sites serve without a login. */
  pageUserAgent?: string;
}

/** Account the worker may log in with, for tools that keep their own session (instaloader). */
export interface StrategyLogin {
  username: string;
  /** In a writable, persistent dir; the tool creates it on the first successful login. */
  sessionFile: string;
  /** The password when a login attempt is allowed now (rate limited; calling it counts as an attempt), else null. */
  password(): string | null;
}

export interface StrategyContext {
  url: string;
  /** Set when the link points at a comment on the post; strategies that can read comments return it as `comment`. */
  commentId?: string;
  /** Empty per-job directory; deleted after the job. */
  tmpDir: string;
  cookiesFile: string | null;
  login: StrategyLogin | null;
  guard: Guard;
  run: Runner;
  log: Logger;
  maxDownloadBytes: number;
  options: StrategyOptions;
  signal?: AbortSignal;
}

export interface Strategy {
  id: StrategyId;
  fetch(ctx: StrategyContext): Promise<FetchResult>;
  /** Cheap "does it still exist" check for source-check; no download. */
  probe(ctx: StrategyContext): Promise<"available" | "gone" | "unknown">;
}

export const DEFAULT_STRATEGY_OPTIONS: StrategyOptions = {
  // ≤1080p, prefer H.264 + MP4 so every Android device plays it
  ytdlpFormatSort: "res:1080,vcodec:h264,ext:mp4:m4a",
  headers: {},
  maxItems: 20,
};

export function kindOf(files: readonly FetchedFile[]): FetchResult["kind"] {
  if (files.length === 0) return "link";
  if (files.length > 1) return "gallery";
  return files[0]?.type === "video" ? "video" : "image";
}

export const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36";
