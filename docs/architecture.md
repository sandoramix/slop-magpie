# Architecture

## Overview

```
┌──────────────────────┐        HTTPS + Bearer token
│ Expo app (Android)   │──────────────────────────────┐
│ share intent / paste │                              │
└──────────────────────┘                              ▼
┌──────────────────────┐                     ┌─────────────────┐
│ Web (later, same     │────────────────────▶│ apps/api (Hono) │
│ Expo codebase)       │                     └────────┬────────┘
└──────────────────────┘                              │
                                 ┌────────────────────┼─────────────────────┐
                                 ▼                    ▼                     ▼
                       ┌──────────────────┐  ┌────────────────┐   ┌──────────────────┐
                       │ PostgreSQL       │  │ pg-boss queue  │   │ BlobStore        │
                       │ (existing, URL)  │  │ (schema pgboss)│   │ local FS → B2    │
                       └──────────────────┘  └───────┬────────┘   └──────────────────┘
                                 ▲                   │                     ▲
                                 │                   ▼                     │
                                 │          ┌─────────────────┐            │
                                 └──────────│ apps/worker     │────────────┘
                                            │ yt-dlp,         │
                                            │ gallery-dl,     │
                                            │ ffmpeg, sharp   │
                                            └─────────────────┘
```

## Components

### apps/mobile
Expo + Expo Router. Android first; the same code targets web (react-native-web) and iOS later.

**Workflow: Continuous Native Generation (CNG).** No `android/` or `ios/` folders in git — `expo prebuild` generates them from `app.config.ts` + config plugins. Native modules (MMKV, share intent, secure store) mean the app runs in a **development build** (`expo-dev-client`), not Expo Go.

| Concern | Choice |
|---|---|
| Routing | **Expo Router** (file-based, typed routes, deep links `magpie://`) |
| Native config | `app.config.ts` (typed, reads t3-env) + config plugins; local plugins in `plugins/` |
| Dev | `expo run:android` → dev build on device/emulator, Metro with fast refresh |
| Builds | EAS Build (free tier) or local `expo run:android --variant release`; profiles in `eas.json` |
| Updates | `expo-updates` (EAS Update) for JS-only changes, optional |
| UI components | **React Native Reusables** (shadcn/ui port for RN: copy-paste components in `components/ui/`, built on rn-primitives) |
| Styling | **NativeWind v4** (Tailwind classes, shadcn CSS-variable theme, light/dark) |
| Icons | `lucide-react-native` |
| Server state | **TanStack Query** — caching, pagination (`useInfiniteQuery`), optimistic updates; cache persisted to MMKV for instant offline browsing |
| Client/UI state | **Zustand** with `persist` middleware on **MMKV** (`react-native-mmkv`; falls back to `localStorage` on web) — view mode, sort, filters, selected folder, theme, server URL |
| Secrets | `expo-secure-store` for the API token (never in Zustand/MMKV) |
| Forms | `react-hook-form` + zod resolver, schemas from `packages/shared` |
| Lists | `@shopify/flash-list` (masonry grid of thumbnails) |
| Media | `expo-image` (thumbnails, caching), `expo-video` (playback) |
| Share target | `expo-share-intent` (Android share sheet → `POST /items`) |
| Env | t3-env (`@t3-oss/env-core`, `EXPO_PUBLIC_` client prefix — no secrets) |

Rule of thumb: **anything that comes from the API lives in TanStack Query, never copied into Zustand.** Zustand holds only local UI/preferences.

The API client is typed from `packages/shared` (Hono RPC client `hc<AppType>`), so endpoints, params and responses are checked at compile time.

### apps/api
Hono on Node 24. Stateless; can be restarted any time.
- Validates every request with zod schemas from `packages/shared`.
- Auth middleware: static bearer token (see [security.md](security.md)).
- CRUD for items, folders, tags, field definitions, smart folders.
- Search (Postgres full-text + trigram).
- Issues HMAC-signed media URLs and serves media with HTTP Range support (local driver).
- Enqueues jobs in pg-boss; never runs downloads itself.

### apps/worker
Node 24 process consuming pg-boss queues. Runs heavy, slow, failure-prone work.
- Pipeline: `fetch → thumbnail → extract → categorize` (see [worker-pipeline.md](worker-pipeline.md)).
- Source-agnostic: per-source strategy chains (`yt-dlp`, `gallery-dl`, `opengraph`, `direct`) with a `generic` fallback for any site (see [sources.md](sources.md)).
- Calls `yt-dlp` / `gallery-dl` as subprocesses, parses their JSON output with zod.
- Concurrency 1 for heavy jobs to protect other services on the Pi.

### packages/shared
The API contract: zod schemas, inferred types, enums, the source registry (URL matching/normalization, see [sources.md](sources.md)), query-language parser. Imported by api, worker and mobile. No Node-only APIs (must run in React Native).

### Env
Every app validates its env with **t3-env** (`@t3-oss/env-core` + zod) in `src/env.ts`. Shared fragments (e.g. storage, database) live in `packages/shared/src/env/` and are composed with `extends`.

### packages/db
Drizzle schema, migrations and a configured client. Used by api and worker.

### packages/storage
`BlobStore` interface plus drivers (`local`, later `s3`). See [storage.md](storage.md).

## Request flow: saving a link

1. User shares a link (reel, post, video, image, any page) to Magpie → app sends `POST /items { url }`.
2. API validates the URL (http(s), SSRF pre-check), resolves the source from the registry (`generic` if none matches), normalizes it.
3. If an item with the same canonical URL or `(source, source_item_id)` exists → return it (`200`). Otherwise insert item with `status = pending` and enqueue `fetch` → `202`.
4. Worker downloads media + metadata, stores blobs, generates thumbnails, extracts keywords, computes suggestions. Item becomes `ready` (or `failed` with error).
5. App polls the item (or refreshes the list) and shows the thumbnail.

## Why this split

- API stays fast and responsive; downloads can take tens of seconds and fail.
- Worker can be throttled or stopped without affecting browsing.
- pg-boss reuses Postgres, so no extra service (Redis) is needed on the Pi.
