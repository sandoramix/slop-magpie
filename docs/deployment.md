# Deployment

Target: Raspberry Pi 5 (16 GB, ARM64), Coolify, external SSD, existing PostgreSQL reachable by connection URL.

## 1. Database

On the existing Postgres instance:

```sql
CREATE ROLE magpie LOGIN PASSWORD '<strong password>';
CREATE DATABASE magpie OWNER magpie;
\c magpie
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- needs a superuser or trusted extension
-- optional, v2 semantic search (only if the instance ships pgvector):
-- CREATE EXTENSION IF NOT EXISTS vector;
```

Check availability:

```sql
SELECT name, default_version, installed_version
FROM pg_available_extensions WHERE name IN ('pg_trgm', 'vector');
```

`DATABASE_URL=postgres://magpie:<pw>@<host>:<port>/magpie` (add `?sslmode=require` if it leaves the host).

pg-boss creates and manages its own schema `pgboss` inside the same database.

## 2. Storage directories

Nothing to prepare by default. Media and cookies live in host directories that default to the home of the user running compose (under Coolify: the user Coolify connects with over SSH):

| Var | Default | Mounted into |
|---|---|---|
| `MEDIA_DIR` | `~/magpie/media` | api, worker (`/data/media`) |
| `COOKIES_HOST_DIR` | `/opt/magpie/cookies` | worker, read-only (`/run/secrets/cookies`) |

Point `MEDIA_DIR` at a big disk (e.g. an SSD mount) for real use. A one-shot `init` service creates missing directories and gives them to uid 1000 (the container user), so no manual `mkdir`/`chown` is needed. Under Coolify it shows as *exited* after it runs; that is expected.

Put per-source cookie files in the cookies dir named `<source-id>.txt`, e.g. `instagram.txt`. `init` makes them `600` and owned by uid 1000 on the next deploy.

## 3. Coolify

Create a **Docker Compose** resource from this Git repo using `docker-compose.yml`.

Services:
- `api` — exposed through Coolify proxy on your domain, HTTPS. Runs migrations on start, then serves.
- `worker` — no ports.

- `init` — one-shot, fixes ownership of the host directories, then exits.

Volumes: bind mounts from `MEDIA_DIR` and `COOKIES_HOST_DIR` (see above).

Redeploys can be triggered from GitHub Actions (the **Deploy** workflow, also run at the end of every release); it calls the resource's deploy webhook. Setup in [releases.md](releases.md#4-coolify-deploy-webhook).

Images can build on the Pi via Coolify, or be pulled from GHCR: each release publishes `ghcr.io/sandoramix/slop-magpie-{api,worker}:<version>` (ARM64). See [releases.md](releases.md).

## 4. Environment

See `.env.example`. Validated at startup by t3-env — the container exits with a clear error if anything is missing. Required:

| Var | Used by | Example |
|---|---|---|
| `DATABASE_URL` | api, worker | `postgres://magpie:...@host:5432/magpie` |
| `API_TOKEN` | api | `openssl rand -base64 48` (the **admin** credential; accounts get their own tokens from the app) |
| `MEDIA_SIGNING_SECRET` | api, worker | `openssl rand -base64 48` |
| `PUBLIC_BASE_URL` | api, worker | `https://magpie.example.com` |
| `STORAGE_DRIVER` | api, worker | `local` |
| `STORAGE_LOCAL_ROOT` | api, worker | `/data/media` |
| `COOKIES_DIR` | worker | `/run/secrets/cookies` |

Optional: `LOG_LEVEL`, `LOG_FORMAT` (`pretty` default, `json` for log shippers), `MAX_VIDEO_MB`, `MAX_DOWNLOAD_MB`, `AUTO_ASSIGN_THRESHOLD`, `WORKER_TMP_DIR`, `WORKER_CONCURRENCY`, `CORS_ORIGINS`, `MEDIA_URL_TTL_SECONDS`.

`TRUST_PROXY` (api, default `false`; `docker-compose.yml` sets `true`): take the client IP from the last `X-Forwarded-For` hop. Enable only behind a proxy that sets that header (Coolify's does), otherwise clients can spoof their IP and dodge the failed-auth rate limit.

Compose-only: `MEDIA_DIR` (default `~/magpie/media`) and `COOKIES_HOST_DIR` (default `/opt/magpie/cookies`); see step 2.

Containers run as the `node` user (uid 1000) with a read-only root filesystem; only the media volume and `/tmp` (tmpfs) are writable.

## 5. Mobile app

CNG workflow: native projects are generated, never committed.

- **Dev:** `pnpm --filter @magpie/mobile android` → runs `expo prebuild` + installs a dev build (`expo-dev-client`) on the connected device/emulator. Then `start` for Metro.
- **Release APK:** built by GitHub Actions on a `v*` tag and attached to the GitHub release ([releases.md](releases.md)).
  - Local test build: `npx expo prebuild --clean && npx expo run:android --variant release` (needs Android SDK + JDK 17).
- Install by sideloading the APK. In app Settings: server URL + API token.
- JS-only changes can ship via `eas update` (optional) without reinstalling.
- Signing keystore: in GitHub repository secrets for CI, backed up outside the repo (never committed).

## Updating fetch tools

When fetches for a site start failing: redeploy the worker (rebuild pulls the latest `yt-dlp` / `gallery-dl`).
