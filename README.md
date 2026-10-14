# slop-magpie

Personal archive and catalog for content found online. Share a link — Instagram reel or post, TikTok, YouTube Short, Pinterest pin, X, Reddit, or any web page — to Magpie, and it downloads the media, picks a thumbnail, guesses where it belongs, and keeps it forever, even if the original is deleted.

Single user. Self-hosted on a Raspberry Pi. Zero running cost.

## Features

- **Save by link** — Android share sheet or paste a URL.
- **Any source** — pluggable source registry (Instagram first); unknown sites fall back to a generic fetcher (yt-dlp / gallery-dl / OpenGraph). See [docs/sources.md](docs/sources.md).
- **Real archive** — video/images, caption, author and metadata are downloaded at save time.
- **Thumbnails** — video frame or resized image for every item.
- **Flexible organization** — combine freely:
  - nested **folders** (an item can live in many),
  - colored **tags**,
  - **keywords** (auto-extracted from hashtags/caption/transcript/OCR, or manual),
  - typed **custom fields** (e.g. recipe → time, difficulty),
  - **notes**, favorite, rating, status (`to try` / `done`),
  - **smart folders** (saved searches).
- **Search** — full-text + fuzzy now, semantic later.
- **Auto-categorization** — suggestions with confidence; uncertain items land in the Inbox. Corrections improve future guesses.
- **Source tracking** — periodic check marks items whose original was removed.

## Stack

TypeScript end to end.

| Part | Tech |
|---|---|
| App | Expo (React Native), Expo Router — Android first, web/iOS later |
| UI | React Native Reusables (shadcn/ui for RN), NativeWind, lucide icons |
| App state | TanStack Query (server state), Zustand + MMKV (UI state), expo-secure-store (token) |
| API | Node 24, Hono, zod |
| Env | t3-env (`@t3-oss/env-core`) in every app |
| Worker | Node 24, pg-boss, `yt-dlp`, `gallery-dl`, `ffmpeg`, `sharp` |
| DB | PostgreSQL (existing instance, via `DATABASE_URL`), Drizzle ORM |
| Storage | `BlobStore` interface — local filesystem now, S3/Backblaze B2 later |
| Deploy | Docker (ARM64) on Coolify |

## Repository layout

```
apps/mobile      Expo app (Android → web → iOS)
apps/api         Hono HTTP API
apps/worker      background jobs (fetch, thumbnail, extract, categorize) + source fetchers
packages/shared  zod schemas, shared types (the API contract), source registry
packages/db      Drizzle schema, migrations, db client
packages/storage BlobStore interface + drivers
docs/            design docs
```

> Status: design phase — docs written, code scaffold next. See [docs/roadmap.md](docs/roadmap.md).

## Quick start (dev)

```sh
cp .env.example .env        # fill DATABASE_URL, API_TOKEN, MEDIA_SIGNING_SECRET
pnpm install
pnpm db:migrate
pnpm dev                    # api + worker + mobile (turbo)
```

Requires Node 24, pnpm 10, and `yt-dlp`, `gallery-dl`, `ffmpeg` on `PATH` for the worker.

## Docs

- [Architecture](docs/architecture.md)
- [Data model](docs/data-model.md)
- [API](docs/api.md)
- [Sources](docs/sources.md)
- [Worker pipeline](docs/worker-pipeline.md)
- [Storage](docs/storage.md)
- [Security](docs/security.md)
- [Deployment](docs/deployment.md)
- [Decisions](docs/decisions.md)
- [Roadmap](docs/roadmap.md)
