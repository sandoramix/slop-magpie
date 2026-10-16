# Roadmap

## Status / handoff (2026-10-16)

Server and Android app are implemented on `dev`; **v0.1.0 is the first release**. Typecheck, lint and tests are green; the app bundles with Metro and the release APK builds locally. Not yet exercised on a device against a live server.

Done:
- Accounts (D23): per-account libraries, admin account management and act-as, temporary token then password login with revocable sessions; mobile account switcher, welcome screen, admin screen, password and display-name settings.
- Server (M1–M5): API routes, search, signed media, worker strategies/sources/jobs, suggestions, sweeps. See [api.md](api.md) and [worker-pipeline.md](worker-pipeline.md).
- `apps/mobile` (Expo SDK 58, Expo Router, NativeWind, RN Reusables, TanStack Query, Zustand + MMKV): settings (URL + token), share intent and clipboard paste, library grid with search/filters/multi-select/bulk actions, item detail (video/images, edit, folders/tags, suggestions, custom fields, refetch, delete), inbox (new / suggestions / failed / gone), folders + smart folders + tags, What's new.
- Release pipeline: root `package.json` version → `app.config.ts`, `plugins/with-release-signing.ts`, `.github/workflows/release.yml`.

Not verified yet:
- Worker jobs have **no tests** beyond keyword extraction and the SSRF guard. Add integration tests with a fake `Runner` (`src/tools/run.ts`) and a local HTTP server (see `net/ssrf.test.ts`) for opengraph/direct, fixture JSON for yt-dlp/gallery-dl, and a real DB via `@magpie/db/testing` for fetch/extract/categorize/sweep.
- Nothing was run against real yt-dlp/gallery-dl/ffmpeg (not installed on the dev host). Build the worker image (`docker build -f apps/worker/Dockerfile .`) and try a few real URLs.
- Docker images not rebuilt since adding `packages/jobs` and `sharp` (Dockerfiles updated, untested).
- The app has never run on a device or emulator. `expo-share-intent` 8.0.1 declares `expo ^57` but the app is on SDK 58; prebuild works, share-sheet behavior is unconfirmed.

Next steps (in order):
1. Deploy on the Pi, install the APK, save a few real links; fix what breaks (worker tests + real-tools smoke run above).
2. App polish: keyword add/remove, custom field and smart folder management screens, in-app update check against GitHub Releases.
3. Docs left: restic backup how-to in [storage.md](storage.md) (M5).

Dev setup for tests: `DATABASE_URL` (env or root `.env`) must point at a server where the role has `CREATEDB`; tests create and drop `magpie_test_*` databases and never touch the named database. Without it, integration tests are skipped. Quick local server: `docker run -d --name magpie-test-pg -e POSTGRES_PASSWORD=test -p 127.0.0.1:54329:5432 postgres:17-alpine` → `DATABASE_URL=postgres://postgres:test@127.0.0.1:54329/postgres`.

## M0 — Scaffold
- [x] pnpm + turborepo monorepo, tsconfig base, eslint, vitest
- [x] `packages/shared`: t3-env fragments, source registry (`instagram`, `generic`) + URL normalizer, SSRF-safe URL validation, API schemas
- [x] `packages/db`: Drizzle schema (all v1 tables), first migration, client
- [x] `packages/storage`: `BlobStore` + local driver + HMAC signer
- [x] `apps/api`: Hono skeleton, t3-env, auth middleware, `/health`, error handler, pino
- [x] `apps/worker`: pg-boss skeleton, t3-env, graceful shutdown, SSRF guard (`net/`)
- [x] `apps/mobile`: Expo (CNG, dev client, `app.config.ts` with app ID `dev.sandoramix.magpie`, `eas.json`), Expo Router, NativeWind + React Native Reusables, TanStack Query, Zustand + MMKV, t3-env
- [x] Dockerfiles (ARM64) + `docker-compose.yml`
- [x] Release pipeline: root `package.json` `version` → app `version` + derived `versionCode` and `extra.changelog` in `app.config.ts`, `plugins/with-release-signing.ts` (signing from `MAGPIE_KEY*` env vars), `scripts/` in `pnpm typecheck`, signing secrets set ([releases.md](releases.md))

## M1 — Save & archive (MVP)
- [x] `POST /items` with normalize + dedupe + enqueue
- [x] Strategies: `yt-dlp`, `gallery-dl`, `opengraph`, `direct`; short-link expansion (untested against real tools)
- [x] Sources: `instagram` (reels + posts/carousels), `generic` fallback
- [x] Thumbnail job
- [x] `GET /items`, `GET /items/:id`, signed media route with Range
- [x] Expo app: settings (URL + token), Android share intent, grid of thumbnails, item detail with video player
- [ ] Deploy on the Pi
- [x] App: Settings → What's new, post-update changelog sheet

## M2 — Organize
- [x] Folders (tree CRUD, move, multi-membership), tags (CRUD, merge)
- [x] Item edit: title, notes, workflow, favorite, rating
- [x] Bulk operations (API); Inbox view (app)
- [x] App: folder tree navigation, tag chips, multi-select

## M3 — Find
- [x] Keyword extraction (hashtags, caption terms)
- [x] Full-text + trigram search, query language (`tag:`, `folder:`, `is:fav`, ...)
- [x] Smart folders (API)
- [x] Custom fields (definitions + per-item values + filters)

## M4 — Auto-categorize
- [x] Rule-based suggestions from keyword ↔ folder/tag history
- [x] Accept/reject suggestions UI, auto-assign threshold

## M5 — Durability
- [x] Source-check cron (`gone` badge and view in the app)
- [x] Audit log pruning; [ ] restic backup docs
- [x] Refetch (API, single + bulk), sweep cron for lost jobs; [x] failed-items view (app)

## Later
- [ ] More sources: `tiktok`, `youtube`, `pinterest`, `x`, `reddit`, `facebook`
- [ ] Web client (Expo web) + iOS Shortcut for sharing
- [ ] Transcripts (whisper.cpp), OCR (tesseract), embeddings (transformers.js + pgvector), semantic search
- [ ] S3 driver + migration to Backblaze B2
- [ ] Better Auth + passkeys (replace static token)
- [ ] In-app update check against GitHub Releases (`/releases/latest`), link to the APK
