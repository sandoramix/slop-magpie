import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat, unlink } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { BlobNotFoundError, type BlobHead, type BlobObject, type BlobRange, type BlobStore, InvalidKeyError, InvalidRangeError } from "../blob-store.ts";
import { assertValidKey, assertValidPrefix, contentTypeForKey } from "../keys.ts";
import { signMediaKey } from "../signer.ts";

export interface LocalBlobStoreOptions {
  root: string;
  signingSecret: string;
  /** Public origin of the API, without trailing slash. */
  publicBaseUrl: string;
}

const isNotFound = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

export function createLocalBlobStore(options: LocalBlobStoreOptions): BlobStore {
  const root = path.resolve(options.root);

  const resolve = (keyOrPrefix: string): string => {
    const full = path.resolve(root, keyOrPrefix);
    // defense in depth on top of key validation
    if (full !== root && !full.startsWith(root + path.sep)) throw new InvalidKeyError(keyOrPrefix);
    return full;
  };

  const head = async (key: string): Promise<BlobHead | null> => {
    assertValidKey(key);
    try {
      const s = await stat(resolve(key));
      if (!s.isFile()) return null;
      return { bytes: s.size, contentType: contentTypeForKey(key) ?? "application/octet-stream" };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  };

  return {
    async put(key: string, body: Readable, meta: { contentType: string; bytes?: number }): Promise<void> {
      assertValidKey(key);
      const target = resolve(key);
      await mkdir(path.dirname(target), { recursive: true });
      const tmp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
      try {
        await pipeline(body, createWriteStream(tmp, { flags: "wx" }));
        if (meta.bytes !== undefined) {
          const { size } = await stat(tmp);
          if (size !== meta.bytes) throw new Error(`size mismatch for ${key}: expected ${meta.bytes}, wrote ${size}`);
        }
        await rename(tmp, target);
      } catch (error) {
        await rm(tmp, { force: true });
        throw error;
      }
    },

    async get(key: string, range?: BlobRange): Promise<BlobObject> {
      const info = await head(key);
      if (!info) throw new BlobNotFoundError(key);
      const file = resolve(key);
      if (!range) return { ...info, body: createReadStream(file) };

      const last = info.bytes - 1;
      const end = Math.min(range.end ?? last, last);
      if (range.start < 0 || range.start > end) throw new InvalidRangeError(info.bytes);
      return { ...info, range: { start: range.start, end }, body: createReadStream(file, { start: range.start, end }) };
    },

    head,

    async delete(key: string): Promise<void> {
      assertValidKey(key);
      try {
        await unlink(resolve(key));
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
    },

    async deletePrefix(prefix: string): Promise<void> {
      assertValidPrefix(prefix);
      await rm(resolve(prefix), { recursive: true, force: true });
    },

    signedUrl(key: string, ttlSeconds: number): Promise<string> {
      assertValidKey(key);
      const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
      const sig = signMediaKey(options.signingSecret, key, exp);
      const encodedKey = key.split("/").map(encodeURIComponent).join("/");
      return Promise.resolve(`${options.publicBaseUrl}/api/v1/media/${encodedKey}?exp=${exp}&sig=${sig}`);
    },
  };
}
