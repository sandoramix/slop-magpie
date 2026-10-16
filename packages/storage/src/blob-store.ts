import type { Readable } from "node:stream";

export interface BlobHead {
  contentType: string;
  bytes: number;
}

export interface BlobObject extends BlobHead {
  body: Readable;
  /** Inclusive byte range actually returned; present only for range requests. */
  range?: { start: number; end: number };
}

export interface BlobRange {
  start: number;
  /** Inclusive. Omitted = until the end. */
  end?: number;
}

/** The only way media is read or written. See docs/storage.md. */
export interface BlobStore {
  put(key: string, body: Readable, meta: { contentType: string; bytes?: number }): Promise<void>;
  get(key: string, range?: BlobRange): Promise<BlobObject>;
  head(key: string): Promise<BlobHead | null>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
}

export class BlobNotFoundError extends Error {
  override name = "BlobNotFoundError";
  constructor(key: string) {
    super(`blob not found: ${key}`);
  }
}

export class InvalidRangeError extends Error {
  override name = "InvalidRangeError";
  readonly size: number;
  constructor(size: number) {
    super("range not satisfiable");
    this.size = size;
  }
}

export class InvalidKeyError extends Error {
  override name = "InvalidKeyError";
  constructor(key: string) {
    super(`invalid blob key: ${JSON.stringify(key.slice(0, 200))}`);
  }
}
