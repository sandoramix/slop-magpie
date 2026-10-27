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

## Next: organize fast (requested 2026-10-24)

Organizing is the focus of the app: keywords, suggestions and tags first, everything reachable in a few taps.

- [x] Suggestions from tag/folder **names** (cold start) and from the **same author's** earlier items (`categorize.ts`)
- [x] **Backfill for existing items**: re-run extract + categorize over the whole library (cron for unorganized items, plus an on-demand "refresh suggestions" bulk op)
- [x] Keyword quality: repeated two-word phrases, spelling variants merged (`slow_cooker` / `#SlowCooker` / "slow cooker"), singular and plural merged. [ ] per-user stop terms. Run "Refresh suggestions" once to re-extract old items
- [x] **Triage screen** as the app's home: one item at a time, accept / edit / reject suggested tags and folders, next
- [x] **Quick-tag sheet** right after sharing a link, before the fetch finishes
- [x] Bulk organize on a selection (tags, folders, suggestions, status) already existed; [x] "apply to similar items" after filing one in the Sort flow
- [x] **Bulk refetch of everything failed** (not capped at a 500-id selection): `POST /items/refetch-failed` + a button in the Inbox
- [x] **Instagram credentials from the app** (admin): upload a session file / cookies without SSH. Store them in the DB (new table, additive migration), worker writes them to `SESSIONS_DIR` / a private cookies copy when they are newer than the file, then runs `session-check` immediately. Show the session state (`ok`/`dead`, last check) in the admin screen.
- [ ] Optional: shorter `session-check` interval while the state is `dead`

## Social layer

Status 2026-10-27: all five phases are on `dev`. Switched off until configured: social login (set a provider's client id and secret) and every source except Instagram (`ENABLED_SOURCES`). Registration is `invite` by default. Nothing here has run against a real Postgres, real provider apps or the real sites yet: the integration tests (`apps/api/src/*.int.test.ts`) need a `DATABASE_URL` with `CREATEDB`.

Public posts, saves, follows, likes, quick feedback, a progress dashboard (requested 2026-10-27). Design in [social.md](social.md).

- [x] 1. Docs, `visibility` column, shared enums
- [x] 2. Publish, save (`item_saves`), delete cascade, follow, like, feed, explore, notifications
- [x] 3. Safety: `REGISTRATION_MODE` (default `invite`), invites, signup, rate limits, reports, blocks, moderation (reports, blocks and signup have app UI; the admin moderation queue is API only for now). Social login (Google, GitHub, Discord) is built and off until a provider's credentials are set ([security.md](security.md#social-login))
- [x] 4. Feedback prompts + "I tried it", dashboard (progress, given/received feedback), per-item feedback card
- [x] 5. Smarter organization: keyword phrases and variant merge, "More like this" on posts (`GET /posts/:id/similar`), popularity ranking that counts saves and "worked" answers. Already existed: auto-assign above the confidence threshold, Sort screen, apply-to-similar. Not done: an undo toast for auto-filed items, embeddings (pgvector) for topic clusters

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
- [x] More sources: `tiktok`, `youtube`, `pinterest`, `x`, `reddit`, `facebook` are implemented and tested but off; switch on with `ENABLED_SOURCES` ([sources.md](sources.md#enabling-a-source)). Not yet run against the real sites
- [ ] Web client (Expo web) + iOS Shortcut for sharing
- [ ] Transcripts (whisper.cpp), OCR (tesseract), embeddings (transformers.js + pgvector), semantic search
- [ ] S3 driver + migration to Backblaze B2
- [ ] Better Auth + passkeys (replace static token)
- [ ] In-app update check against GitHub Releases (`/releases/latest`), link to the APK
