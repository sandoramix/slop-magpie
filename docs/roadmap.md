# Roadmap

## M0 — Scaffold
- [ ] pnpm + turborepo monorepo, tsconfig base, eslint, vitest
- [ ] `packages/shared`: t3-env fragments, source registry (`instagram`, `generic`) + URL normalizer, SSRF-safe URL validation, API schemas
- [ ] `packages/db`: Drizzle schema (all v1 tables), first migration, client
- [ ] `packages/storage`: `BlobStore` + local driver + HMAC signer
- [ ] `apps/api`: Hono skeleton, t3-env, auth middleware, `/health`, error handler, pino
- [ ] `apps/worker`: pg-boss skeleton, t3-env, graceful shutdown, SSRF guard (`net/`)
- [ ] `apps/mobile`: Expo (CNG, dev client, `app.config.ts`, `eas.json`), Expo Router, NativeWind + React Native Reusables, TanStack Query, Zustand + MMKV, t3-env
- [ ] Dockerfiles (ARM64) + `docker-compose.yml`

## M1 — Save & archive (MVP)
- [ ] `POST /items` with normalize + dedupe + enqueue
- [ ] Strategies: `yt-dlp`, `gallery-dl`, `opengraph`, `direct`; short-link expansion
- [ ] Sources: `instagram` (reels + posts/carousels), `generic` fallback
- [ ] Thumbnail job
- [ ] `GET /items`, `GET /items/:id`, signed media route with Range
- [ ] Expo app: settings (URL + token), Android share intent, grid of thumbnails, item detail with video player
- [ ] Deploy on the Pi

## M2 — Organize
- [ ] Folders (tree CRUD, move, multi-membership), tags (CRUD, merge)
- [ ] Item edit: title, notes, workflow, favorite, rating
- [ ] Bulk operations, Inbox view
- [ ] App: folder tree navigation, tag chips, multi-select

## M3 — Find
- [ ] Keyword extraction (hashtags, caption terms)
- [ ] Full-text + trigram search, query language (`tag:`, `folder:`, `is:fav`, ...)
- [ ] Smart folders
- [ ] Custom fields (definitions + per-item values + filters)

## M4 — Auto-categorize
- [ ] Rule-based suggestions from keyword ↔ folder/tag history
- [ ] Accept/reject suggestions UI, auto-assign threshold

## M5 — Durability
- [ ] Source-check cron, `gone` badge
- [ ] Audit log pruning, restic backup docs
- [ ] Refetch / failed-items view

## Later
- [ ] More sources: `tiktok`, `youtube`, `pinterest`, `x`, `reddit`, `facebook`
- [ ] Web client (Expo web) + iOS Shortcut for sharing
- [ ] Transcripts (whisper.cpp), OCR (tesseract), embeddings (transformers.js + pgvector), semantic search
- [ ] S3 driver + migration to Backblaze B2
- [ ] Better Auth + passkeys (replace static token)
