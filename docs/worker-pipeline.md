# Worker pipeline

`apps/worker` consumes pg-boss queues. Each step is an idempotent job keyed by item ID, so retries and `refetch` are safe.

```
POST /items
    │
    ▼
 fetch ──▶ thumbnail ──▶ extract ──▶ categorize ──▶ ready
                              │
                              └──▶ (v2) transcribe ─▶ ocr ─▶ embed ─▶ categorize
```

Item `fetch_status` moves `pending → fetching → ready | failed`. Steps after `fetch` failing do not mark the item failed — the media is already archived; the step is retried and logged.

## Jobs

### fetch
Source-agnostic. Details of sources and strategies: [sources.md](sources.md).

1. Expand short links / redirects (SSRF-checked per hop), re-resolve the source, finalize `canonical_url`; merge into an existing item if it now dedupes.
2. Look up the `SourceFetcher` for `items.source` (or `generic`).
3. Run its strategy chain (`yt-dlp`, `gallery-dl`, `opengraph`, `direct`) into a temp dir (`WORKER_TMP_DIR`), using `COOKIES_DIR/<source>.txt` if present. Video format: best ≤1080p MP4.
4. Each strategy parses its tool output with zod into a common `FetchResult`. Unknown fields go to `raw_meta`.
5. Optionally re-encode oversized video (`ffmpeg`, H.264 720p, CRF 23) if `> MAX_VIDEO_MB`.
6. Storage limit: if the downloaded files plus the account's other media would exceed `users.storage_limit_bytes`, the item fails (`fetch_status = failed`, no retry) with a message saying so; "Refetch" works once space is freed or the limit raised. Otherwise hash (sha256), `BlobStore.put` each file under `items/<itemId>/<position>.<ext>`, insert `media` rows. No media at all → `kind = link`, preview image (if any) stored as media.
7. Update item metadata (author, title, caption, posted_at, kind, source_item_id, `shared_comment`), set `availability = available`. When the saved link names a comment (Instagram `/p/<code>/c/<id>/` or `?comment_id=`), the strategy context carries `commentId`; `instaloader` then runs a second, comments-only pass (`--comments`) and returns the comment as `FetchResult.comment`. A failed or empty pass never fails the post: `shared_comment` keeps just the id until a later refetch reads it.

Retries: 3 with exponential backoff (1 min, 10 min, 1 h). On final failure: `fetch_status = failed`, `fetch_error` set.

Typical errors and handling:

| Error | Handling |
|---|---|
| login required / rate limited | retry with backoff; check cookies file |
| content not found / private | `failed`, `availability = gone` |
| no strategy yields anything | `failed` immediately, no retry |
| blocked target (SSRF guard) | `failed` immediately, no retry, audited |
| account over its storage limit | `failed` immediately, no retry; message shows used / limit |

### thumbnail
- Video: `ffmpeg` frame at ~1 s (or 10% of duration), scaled to 480 px wide.
- Image: `sharp` resize to 480 px wide.
- Output WebP, quality 75, key `items/<itemId>/<position>.thumb.webp`.

### extract
Builds `item_keywords`:
- `hashtag`: hashtags from caption in one canonical spelling (`canonicalKeyword` in `packages/shared/src/text`): lower case, `#` stripped, underscores and camel case become spaces, so `#SlowCooker`, `#slow_cooker` and a hand-typed "slow cooker" are the same keyword.
- `caption`: top terms from caption (stopwords IT+EN removed). Two-word phrases that repeat in the caption are terms too, and a plural counts as its singular when both appear.
- `transcript` / `ocr`: same, once v2 steps exist.

### categorize
Produces folder/tag suggestions with confidence 0–1.
- **v1 — rules:** keyword → folder/tag rules learned from manual assignments: for each keyword, count how often items carrying it ended up in each folder/tag. Score = weighted vote, normalized.
- **v2 — embeddings:** kNN over `items.embedding` of manually categorized items (if `pgvector` available).

Above `AUTO_ASSIGN_THRESHOLD` (default 0.8) → inserted as `assigned_by = auto`. Below → stored as suggestions only, item stays in `workflow = inbox`.

### source-check (cron, weekly)
Lightweight metadata probe (first strategy of the item's source, no download) for items whose `availability_checked_at` is oldest. Throttled (e.g. 50/week). Updates `availability`. Never deletes anything.

### sweep (cron, every 15 min)
Re-enqueues lost work: `pending` items untouched for 10 min (3 h if they are waiting for a retry), `fetching` items untouched for 30 min (worker died), and `ready` items with media lacking a thumbnail.

### session-check (cron, every 6 h)
Metadata-only instaloader request for the newest archived Instagram post; keeps the session warm, renews a dead one, stores `ok`/`dead` in `SESSIONS_DIR/instagram.state` and audits `session.dead` / `session.recovered`. After every good check it re-enqueues recent failed items and OpenGraph-only `link` items of that source (fewer than 8 attempts). Details: [sources.md](sources.md#staying-alive-without-babysitting).

### tool-update (cron, daily + once at start)
Installs the newest yt-dlp, gallery-dl and instaloader into `SESSIONS_DIR/pytools` (shadowing the image's copies), verifies they start, rolls back otherwise.

### blob-delete
Deletes all blobs with prefix `items/<itemId>/` after an item is deleted.

### audit-prune (cron, daily)
Deletes `audit_log` rows older than 180 days.

## Cookies

The tools write cookies back on exit and the mount is read-only, so each job copies `<source>.txt` into its temp dir and passes the copy.

Some sources (Instagram, Facebook, sometimes TikTok/X) require login. Per-source cookie files in Netscape format live in `COOKIES_DIR` as `<source-id>.txt`, mounted read-only. Use **secondary accounts** (risk of flag/ban). Never commit, never log.

## Downloads

`gallery-dl` only lists files (`-j`); the worker downloads them itself through the SSRF guard, like `opengraph` and `direct`. Every file is capped at `MAX_DOWNLOAD_MB` (default 500). Code: `apps/worker/src/strategies/`.

## Resource limits

- Heavy jobs (fetch, thumbnail, transcribe) run with concurrency 1.
- Container CPU/memory limits set in `docker-compose.yml`.
- Temp files are deleted after each job, even on failure.

## Tool versions

`yt-dlp` and `gallery-dl` break when sites change. The worker image installs them at build time and the `tool-update` job refreshes them daily into the sessions volume, so a rebuild is only needed for non-Python changes. Versions are logged at worker start and after each update.
