# Security

Threat model: single owner, API publicly reachable, running on a home server that also hosts other services. Goals: nobody else can read or write the archive; a compromise of Magpie must not spread to the rest of the Pi.

## Authentication

**Static bearer token** (deliberate, temporary — see [decisions.md](decisions.md)).

- Generate: `openssl rand -base64 48`. Store as `API_TOKEN` in Coolify env. Never in the repo, never in the APK.
- Compared with `crypto.timingSafeEqual` on SHA-256 digests (constant time, length-independent).
- Mobile app: token entered once in Settings, stored in `expo-secure-store`.
- Rotation: change `API_TOKEN`, redeploy, re-enter in app.
- Auth logic lives in one Hono middleware so it can be swapped later (e.g. Better Auth + passkeys) without touching routes.

## Media authorization

Media URLs are HMAC-signed with `MEDIA_SIGNING_SECRET` (separate from `API_TOKEN`) and expire (default 1 h). This lets `<Image>`/`<video>`/web `<img>` load media without headers and without ever putting the API token in a URL.

## Transport

- HTTPS only, terminated by Coolify's proxy (Let's Encrypt) or a Cloudflare Tunnel.
- `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` set by the API.
- CORS: only the configured web origin (when the web client exists); mobile doesn't need CORS.

## Abuse protection

- Failed-auth rate limit per IP (10 / 15 min) → `429`, logged in `audit_log`.
- Request body size limit (64 KB; no uploads through the API in v1).
- **SSRF guard** (any public URL is accepted, so the worker must never reach the home network):
  - only `http`/`https`, default ports 80/443 (configurable), no credentials in URL;
  - hostname resolved before every request and every redirect hop; reject loopback, private (RFC 1918), link-local, CGNAT (100.64/10, incl. Tailscale), ULA, multicast and the server's own addresses;
  - redirect limit 5, response size limit, timeouts;
  - `yt-dlp`/`gallery-dl` do their own networking: the pre-check runs on the input URL and the expanded URL; as defense in depth the worker container should have no route to the LAN (Docker network with egress-only internet, or host firewall rule dropping worker → `192.168.0.0/16`, `10.0.0.0/8`, `172.16.0.0/12` except the Postgres host/port).

## Accounting

`audit_log` records auth failures, deletes, bulk operations, token-protected admin actions, with IP + user agent. Never stores tokens, cookies, or signed URLs. Retention 180 days.

## Isolation on the Pi

- Own Coolify project/resource; containers on their own Docker network.
- Postgres: dedicated database `magpie` and role `magpie` (owner of that DB only, no superuser, no access to other DBs). Connection via `DATABASE_URL`; use TLS (`sslmode=require`) if the connection leaves the host.
- Containers run as non-root, read-only root filesystem, writable only: media volume, temp dir.
- CPU/memory limits on the worker so ffmpeg/downloads can't starve other services.
- Coolify dashboard: 2FA on, ideally reachable only via Tailscale.

## Secrets

| Secret | Where |
|---|---|
| `API_TOKEN` | Coolify env |
| `MEDIA_SIGNING_SECRET` | Coolify env |
| `DATABASE_URL` | Coolify env |
| Source cookies | `<source-id>.txt` files in a read-only mounted dir, path in `COOKIES_DIR` |
| B2 keys (later) | Coolify env, application key scoped to the one bucket |

Logs never include any of the above (pino redaction paths configured).

## Source accounts

Use secondary accounts for cookies (Instagram, Facebook, ...). Automated access may get them flagged or banned.

## Environment validation

All env vars are validated at startup with t3-env (`@t3-oss/env-core` + zod); the process exits on invalid or missing config. Secrets are never exposed to the client bundle — the Expo app only reads `EXPO_PUBLIC_*` vars, which must never contain secrets.
