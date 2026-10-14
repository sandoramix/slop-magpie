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

## 2. Storage directory

```sh
sudo mkdir -p /mnt/ssd/magpie/media /mnt/ssd/magpie/secrets
sudo chown -R 1000:1000 /mnt/ssd/magpie   # matches container user
```

Put per-source cookie files in `/mnt/ssd/magpie/secrets/cookies/` named `<source-id>.txt`, e.g. `instagram.txt` (`chmod 600`).

## 3. Coolify

Create a **Docker Compose** resource from this Git repo using `docker-compose.yml`.

Services:
- `api` — exposed through Coolify proxy on your domain, HTTPS. Runs migrations on start, then serves.
- `worker` — no ports.

Volumes (bind mounts):
- `/mnt/ssd/magpie/media:/data/media` → api, worker
- `/mnt/ssd/magpie/secrets/cookies:/run/secrets/cookies:ro` → worker

Images build on the Pi via Coolify (Pi 5 is fast enough). Optional later: GitHub Actions multi-arch build → GHCR, Coolify pulls.

## 4. Environment

See `.env.example`. Validated at startup by t3-env — the container exits with a clear error if anything is missing. Required:

| Var | Used by | Example |
|---|---|---|
| `DATABASE_URL` | api, worker | `postgres://magpie:...@host:5432/magpie` |
| `API_TOKEN` | api | `openssl rand -base64 48` |
| `MEDIA_SIGNING_SECRET` | api, worker | `openssl rand -base64 48` |
| `PUBLIC_BASE_URL` | api, worker | `https://magpie.example.com` |
| `STORAGE_DRIVER` | api, worker | `local` |
| `STORAGE_LOCAL_ROOT` | api, worker | `/data/media` |
| `COOKIES_DIR` | worker | `/run/secrets/cookies` |

Optional: `LOG_LEVEL`, `MAX_VIDEO_MB`, `AUTO_ASSIGN_THRESHOLD`, `WORKER_TMP_DIR`, `WORKER_CONCURRENCY`.

## 5. Mobile app

CNG workflow: native projects are generated, never committed.

- **Dev:** `pnpm --filter @magpie/mobile android` → runs `expo prebuild` + installs a dev build (`expo-dev-client`) on the connected device/emulator. Then `start` for Metro.
- **Release APK:**
  - EAS Build (free tier, cloud): `eas build -p android --profile preview` → downloadable APK.
  - Local: `npx expo prebuild --clean && npx expo run:android --variant release` (needs Android SDK + JDK 17).
- Install by sideloading the APK. In app Settings: server URL + API token.
- JS-only changes can ship via `eas update` (optional) without reinstalling.
- Signing keystore: managed by EAS, or kept outside the repo for local builds (never committed).

## Updating fetch tools

When fetches for a site start failing: redeploy the worker (rebuild pulls the latest `yt-dlp` / `gallery-dl`).
