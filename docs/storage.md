# Storage

All media access goes through the `BlobStore` interface in `packages/storage`.

```ts
export interface BlobStore {
  put(key: string, body: Readable, meta: { contentType: string; bytes?: number }): Promise<void>;
  get(key: string, range?: { start: number; end?: number }): Promise<BlobObject>;
  head(key: string): Promise<BlobHead | null>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
}
```

Selected by `STORAGE_DRIVER` (`local` | `s3`).

## Key layout

```
items/<itemId>/<position>.<ext>          original (mp4, jpg, webp, ...)
items/<itemId>/<position>.thumb.webp     thumbnail
```

Keys never contain user input other than UUIDs and a whitelisted extension.

## local driver (current)

- Root: `STORAGE_LOCAL_ROOT` (container path, e.g. `/data/media`), bind-mounted from the Pi's SSD (e.g. `/mnt/ssd/magpie/media`).
- Writes go to a temp file and are atomically renamed.
- Path traversal guard: resolved path must stay under the root.
- `signedUrl` returns `${PUBLIC_BASE_URL}/api/v1/media/<key>?exp=<unix>&sig=<sig>` where

  ```
  sig = base64url(HMAC-SHA256(MEDIA_SIGNING_SECRET, `${key}\n${exp}`))
  ```

  verified by the API with `timingSafeEqual`, then streamed with Range support.
- The volume is mounted only into `api` and `worker`. No storage service is exposed on the network.

## s3 driver (later — Backblaze B2)

- `@aws-sdk/client-s3` against B2's S3-compatible endpoint. Private bucket.
- `signedUrl` returns a native S3 presigned GET URL; clients fetch directly from B2.
- Env: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
- Migration: one-off script copies every key from `local` to `s3`, verifies sha256 against `media.sha256`, then switch `STORAGE_DRIVER`.

## Backups

- DB: covered by the existing Postgres instance's backup routine — verify `magpie` database is included.
- Media: while `local` is primary, a nightly `restic` backup of the media dir to an off-site target (e.g. B2 free 10 GB) is recommended.

## Sizing

Reels ≈ 3–20 MB each; thumbnails ≈ 20–40 KB. 1 TB SSD ≈ 50k+ reels. Not a concern for local; matters for B2 (10 GB free ≈ 700–3000 items).
