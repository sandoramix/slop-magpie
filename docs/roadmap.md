# Roadmap

## Status / handoff (2026-10-14)

Server side of M1–M5 is implemented on `dev`; the **mobile app does not exist yet**. Next agent: start at "Next steps".

Done and tested (`pnpm typecheck && pnpm lint && pnpm test` green; API integration tests run against Postgres):
- `packages/shared`: full API contract (items, folders, tags, custom fields, smart folders, stats, bulk), query language parser (`src/query/`), folder tree + custom-field validation helpers.
- `packages/db`: migration `0002_suggestions` (suggestion tables, fetch-status and availability indexes); `@magpie/db/testing` creates throwaway databases.
- `packages/jobs` (new): queue names/options + `ItemJobData`, shared by api (sender) and worker (consumer).
- `apps/api`: every route in [api.md](api.md), search (full-text + keywords + tags + trigram), keyset/offset cursors, signed media with Range. `src/api.int.test.ts` covers them.
- `apps/worker`: strategies (`yt-dlp`, `gallery-dl`, `opengraph`, `direct`) + chain, sources (`instagram`, `generic`), jobs `fetch`, `thumbnail`, `extract`, `categorize`, `source-check`, `sweep`, wired in `src/index.ts`.

Not verified yet:
- Worker jobs have **no tests** beyond keyword extraction and the SSRF guard. Add integration tests with a fake `Runner` (`src/tools/run.ts`) and a local HTTP server (see `net/ssrf.test.ts`) for opengraph/direct, fixture JSON for yt-dlp/gallery-dl, and a real DB via `@magpie/db/testing` for fetch/extract/categorize/sweep.
- Nothing was run against real yt-dlp/gallery-dl/ffmpeg (not installed on the dev host). Build the worker image (`docker build -f apps/worker/Dockerfile .`) and try a few real URLs.
- Docker images not rebuilt since adding `packages/jobs` and `sharp` (Dockerfiles updated, untested).

Next steps (in order):
1. Worker tests + a real-tools smoke run (above).
2. `apps/mobile` scaffold (M0 item below). Decided: no Hono RPC client; write a small fetch client in `apps/mobile/lib/api.ts` that parses every response with the zod schemas from `@magpie/shared/api` (D19). Expo SDK 57 was current on npm.
3. Mobile screens: settings (URL + token), share intent → `POST /items`, grid (`GET /items`, `thumbUrl`/`aspectRatio`), item detail (media, edit, folders/tags pickers, suggestions accept/dismiss), folder tree, tags, search box (query language; `parseQuery` is in shared for chips), smart folders, inbox (`workflow=inbox` / `hasSuggestions=true`), failed items (`fetchStatus=failed` + bulk `refetch`), What's new.
4. Release pipeline item (M0) once the app exists; then deploy on the Pi.
5. Docs left: restic backup how-to in [storage.md](storage.md) (M5).

Dev setup for tests: `DATABASE_URL` (env or root `.env`) must point at a server where the role has `CREATEDB`; tests create and drop `magpie_test_*` databases and never touch the named database. Without it, integration tests are skipped. Quick local server: `docker run -d --name magpie-test-pg -e POSTGRES_PASSWORD=test -p 127.0.0.1:54329:5432 postgres:17-alpine` → `DATABASE_URL=postgres://postgres:test@127.0.0.1:54329/postgres`.

## M0 — Scaffold
- [x] pnpm + turborepo monorepo, tsconfig base, eslint, vitest
- [x] `packages/shared`: t3-env fragments, source registry (`instagram`, `generic`) + URL normalizer, SSRF-safe URL validation, API schemas
- [x] `packages/db`: Drizzle schema (all v1 tables), first migration, client
- [x] `packages/storage`: `BlobStore` + local driver + HMAC signer
- [x] `apps/api`: Hono skeleton, t3-env, auth middleware, `/health`, error handler, pino
- [x] `apps/worker`: pg-boss skeleton, t3-env, graceful shutdown, SSRF guard (`net/`)
- [ ] `apps/mobile`: Expo (CNG, dev client, `app.config.ts` with app ID `dev.sandoramix.magpie`, `eas.json`), Expo Router, NativeWind + React Native Reusables, TanStack Query, Zustand + MMKV, t3-env
- [x] Dockerfiles (ARM64) + `docker-compose.yml`
- [ ] Release pipeline: root `package.json` `version` → app `version` + derived `versionCode` and `extra.changelog` in `app.config.ts`, `plugins/with-release-signing.ts` (signing from `MAGPIE_KEY*` env vars), `scripts/` in `pnpm typecheck`, signing secrets set ([releases.md](releases.md))

## M1 — Save & archive (MVP)
- [x] `POST /items` with normalize + dedupe + enqueue
- [x] Strategies: `yt-dlp`, `gallery-dl`, `opengraph`, `direct`; short-link expansion (untested against real tools)
- [x] Sources: `instagram` (reels + posts/carousels), `generic` fallback
- [x] Thumbnail job
- [x] `GET /items`, `GET /items/:id`, signed media route with Range
- [ ] Expo app: settings (URL + token), Android share intent, grid of thumbnails, item detail with video player
- [ ] Deploy on the Pi
- [ ] App: Settings → What's new, post-update changelog sheet

## M2 — Organize
- [x] Folders (tree CRUD, move, multi-membership), tags (CRUD, merge)
- [x] Item edit: title, notes, workflow, favorite, rating
- [x] Bulk operations (API); Inbox view (app) open
- [ ] App: folder tree navigation, tag chips, multi-select

## M3 — Find
- [x] Keyword extraction (hashtags, caption terms)
- [x] Full-text + trigram search, query language (`tag:`, `folder:`, `is:fav`, ...)
- [x] Smart folders (API)
- [x] Custom fields (definitions + per-item values + filters)

## M4 — Auto-categorize
- [x] Rule-based suggestions from keyword ↔ folder/tag history
- [ ] Accept/reject suggestions UI (API done), auto-assign threshold (done)

## M5 — Durability
- [x] Source-check cron (`gone` badge: app)
- [x] Audit log pruning; [ ] restic backup docs
- [x] Refetch (API, single + bulk), sweep cron for lost jobs; [ ] failed-items view (app)

## Later
- [ ] More sources: `tiktok`, `youtube`, `pinterest`, `x`, `reddit`, `facebook`
- [ ] Web client (Expo web) + iOS Shortcut for sharing
- [ ] Transcripts (whisper.cpp), OCR (tesseract), embeddings (transformers.js + pgvector), semantic search
- [ ] S3 driver + migration to Backblaze B2
- [ ] Better Auth + passkeys (replace static token)
- [ ] In-app update check against GitHub Releases (`/releases/latest`), link to the APK
