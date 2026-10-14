# slop-magpie

Self-hosted archive for posts and videos found online. Submit a link from Instagram, TikTok, YouTube, Pinterest, X, Reddit or any web page, and Magpie downloads the media and metadata, generates a thumbnail, and suggests where to file it. Saved items stay available after the original post is removed.

> [!WARNING]
> **AI-generated project.** As the `slop-` prefix says, the design, documentation and code in this repository were produced mostly by an AI coding agent. The project is provided as-is and will probably not be maintained. Issues and pull requests may go unanswered. Review the code before you rely on it.

## Features

- **Save by link** from the Android share sheet or by pasting a URL.
- **Pluggable sources.** Each supported site is a separate module. Other URLs go through a generic fetcher (yt-dlp, gallery-dl, OpenGraph). See [docs/sources.md](docs/sources.md).
- **Full archive.** Media, caption, author and metadata are downloaded when an item is saved.
- **Thumbnails** for every item, taken from a video frame or a resized image.
- **Organization**
  - nested folders (one item can be in several)
  - tags
  - keywords, extracted automatically or added by hand
  - typed custom fields
  - notes, favorites, ratings and status
  - smart folders (saved searches)
- **Search** with full-text and fuzzy matching.
- **Auto-categorization.** Each suggestion has a confidence score. Low-confidence items wait in an inbox for review, and corrections improve later suggestions.
- **Source monitoring.** Items whose original has been removed are flagged.

## Architecture

| Component | Technology |
|---|---|
| Client | Expo (React Native), Expo Router, NativeWind, React Native Reusables |
| API | Node.js, Hono, zod |
| Worker | Node.js, pg-boss, yt-dlp, gallery-dl, ffmpeg, sharp |
| Database | PostgreSQL, Drizzle ORM |
| Storage | `BlobStore` abstraction (local filesystem; S3-compatible planned) |

All project code is TypeScript. yt-dlp and gallery-dl run as external command-line tools.

```
apps/mobile       Expo client
apps/api          HTTP API
apps/worker       background jobs and source fetchers
packages/shared   API contract (zod schemas) and source registry
packages/db       Drizzle schema and migrations
packages/storage  BlobStore interface and drivers
docs/             design documentation
```

## Status

The server scaffold (API, worker, database, storage) is in place; the mobile app scaffold is next. See the [roadmap](docs/roadmap.md).

## Getting started

Requirements:

- Node.js 24+
- pnpm 10+
- PostgreSQL
- `yt-dlp`, `gallery-dl` and `ffmpeg` on `PATH` (worker only)

```sh
cp .env.example .env   # set DATABASE_URL, API_TOKEN, MEDIA_SIGNING_SECRET
pnpm install
pnpm db:migrate
pnpm dev
```

See [docs/deployment.md](docs/deployment.md) for production setup. Each [GitHub release](../../releases) includes a prebuilt Android APK, and server images are published to GHCR. Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## Documentation

- [Architecture](docs/architecture.md)
- [Data model](docs/data-model.md)
- [API](docs/api.md)
- [Sources](docs/sources.md)
- [Worker pipeline](docs/worker-pipeline.md)
- [Storage](docs/storage.md)
- [Security](docs/security.md)
- [Deployment](docs/deployment.md)
- [Releases](docs/releases.md)
- [Design decisions](docs/decisions.md)
- [Roadmap](docs/roadmap.md)
