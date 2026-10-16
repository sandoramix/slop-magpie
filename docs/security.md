# Security

Threat model: one owner plus the accounts they hand out, API publicly reachable, running on a home server that also hosts other services. Goals: nobody else can read or write the archive; a compromise of Magpie must not spread to the rest of the Pi.

## Authentication

Accounts own their libraries ([D23](decisions.md)). Three kinds of bearer token, resolved in one Hono middleware so they can be swapped without touching routes:

| Token | Who | Notes |
|---|---|---|
| `API_TOKEN` (environment) | the **admin** | Generate with `openssl rand -base64 48`, store in Coolify env, never in the repo or the APK. Compared with `crypto.timingSafeEqual` on SHA-256 digests. Never locked out: it is the recovery credential. |
| generated account token `mgp_…` | a new account | **Temporary.** Shown once when the admin creates (or resets) the account; stored as a SHA-256 hash. Stops working when the person sets a password. |
| session token `mgs_…` | one device of an account with a password | Created by `POST /auth/login` (username + password) or by `PUT /me/password`; stored as a SHA-256 hash; 180 days, sliding; revocable (`POST /me/logout`). |

Rules:
- Passwords are optional, at least 10 characters, hashed with scrypt (parameters stored with the hash). Login failures are rate limited per IP and per username (10 / 15 min), logged to `audit_log` (username only, never the password), and a missing username costs the same time as a wrong password.
- Changing the password signs out the other devices. **Forgot password:** the admin resets the account (`POST /users/:id/token`): new temporary token, password removed, every session revoked.
- **Admin powers:** manage accounts (`/users`) and work inside any account's library by sending `X-Magpie-Act-As: <account id>`. Anything that changes another account's data this way is audited as `admin.act_as`. A non-admin sending the header gets 403. The username is fixed; people can change only a display name.
- **Isolation:** every query is scoped by the owner (`deps.userId`); ids from another account answer 404 (or 400 when used as a folder/tag reference). Tested in `apps/api/src/accounts.int.test.ts`.
- Mobile app: the server URL and one token per saved account (the generated token, or the session token after a password login), kept in `expo-secure-store`; never in the APK or MMKV.

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
