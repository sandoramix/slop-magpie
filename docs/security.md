# Security

Threat model: one owner plus the accounts they hand out, API publicly reachable, running on a home server that also hosts other services. Goals: nobody else can read or write the archive; a compromise of Magpie must not spread to the rest of the Pi.

## Authentication

Accounts own their libraries ([D23](decisions.md)). Three kinds of bearer token, resolved in one Hono middleware so they can be swapped without touching routes:

| Token | Who | Notes |
|---|---|---|
| `API_TOKEN` (environment) | the **admin** | Generate with `openssl rand -base64 48`, store in Coolify env, never in the repo or the APK. Compared with `crypto.timingSafeEqual` on SHA-256 digests. It stays valid even if the root admin also adds a password (token alone, or token plus password), so it is never locked out and is the recovery credential. |
| generated account token `mgp_…` | a new account | **Temporary.** Shown once when the admin creates (or resets) the account; stored as a SHA-256 hash. Stops working when the person sets a password. |
| session token `mgs_…` | one device of an account with a password | Created by `POST /auth/login` (username + password) or by `PUT /me/password`; stored as a SHA-256 hash; 180 days, sliding; revocable (`POST /me/logout`). |

Rules:
- Passwords are optional, at least 10 characters, hashed with scrypt (parameters stored with the hash). Login failures are rate limited per IP and per username (10 / 15 min), logged to `audit_log` (username only, never the password), and a missing username costs the same time as a wrong password.
- Changing the password signs out the other devices. **Forgot password:** the admin resets the account (`POST /users/:id/token`): new temporary token, password removed, every session revoked.
- **Roles:** `user` or `admin`, chosen when the account is created and changeable by an admin (never the root admin's, never your own). The root admin is the built-in account behind `API_TOKEN`; other admins are normal accounts with a generated token that becomes a password session, and lose every admin power the moment they are demoted (the role is read on each request).
- **Invites:** when an admin creates or resets an account the app offers an invite: a tappable `https://<server>/invite#url=…&username=…&token=…` link (the landing page turns it into `magpie://connect?…`; see [api.md](api.md#invite-page)) plus the same details as text. For an account that has not signed in yet, the admin can issue a fresh token to share the invite again (tokens are stored only as hashes, so the old one cannot be shown). It carries the temporary token, so it is only as private as the channel it is sent through; the token stops working once the person sets a password, and the connect screen asks for confirmation and checks the token with the server before saving anything. Invites are built on the device and never stored on the server.
- **Deleted accounts:** deleting an account keeps the sha256 of its generated token and session tokens in `deleted_tokens` (no library data, purged after a year). A request with one of them gets `401` with `reason: "account_deleted"` instead of the generic message, so the phone can say what happened and drop the account. Fresh logins for a deleted username fail like any wrong password, so usernames are not revealed.
- **Admin powers:** manage accounts (`/users`) and work inside any account's library by sending `X-Magpie-Act-As: <account id>`. Anything that changes another account's data this way is audited as `admin.act_as`. A non-admin sending the header gets 403. The username is fixed; people can change only a display name.
- **Isolation:** every query is scoped by the owner (`deps.userId`); ids from another account answer 404 (or 400 when used as a folder/tag reference). Tested in `apps/api/src/accounts.int.test.ts`.
- Mobile app: the server URL and one token per saved account (the generated token, or the session token after a password login), kept in `expo-secure-store`; never in the APK or MMKV.

## Social login

Google, GitHub and Discord are implemented and **off until configured**: a provider is offered only when both its client id and secret are set (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `GITHUB_...`, `DISCORD_...` on the API). `GET /auth/config` lists the configured ones in `providers`; the app always shows the three buttons and enables only those.

Setup per provider: create an OAuth app and register this redirect URI (it is `PUBLIC_BASE_URL` plus a fixed path):

```
https://<your server>/api/v1/auth/oauth/<google|github|discord>/callback
```

Flow (authorization code + PKCE, code exchanged on the server so client secrets never reach the phone):

1. App calls `POST /auth/oauth/:provider/start` and opens the returned URL in the system browser. The API stores a single-use `state` (hash only) with the PKCE verifier, valid 10 minutes.
2. The provider redirects the browser to the API callback. The API consumes the state, exchanges the code with its client secret, reads the profile, and stores a single-use `ticket` (hash only, 3 minutes).
3. The API redirects to `magpie://oauth?status=ticket&ticket=...`. The ticket holds a verified identity, no credentials.
4. The app calls `POST /auth/oauth/exchange` with the ticket. A known identity gets a session like `/auth/login`. A new one first gets `signup_required` (with a suggested username and whether an invite is needed); the app asks again with `username` (and the invite code in `invite` mode), which creates the account with no password and links the identity.

Rules the code follows:

- The key of a link is the provider's user id (`auth_identities`), never the email. Nothing is ever linked to an existing account by email; linking is an explicit action by a signed-in user (`POST /me/identities/:provider/link`), and a provider account already linked to someone else is refused.
- `REGISTRATION_MODE=invite` applies to first-time social logins too. Suspended accounts cannot sign in this way either.
- Removing the last way into an account (no password, no temporary token, no other identity) is refused (`DELETE /me/identities/:provider`).
- Every start, callback and exchange counts against a per-IP limit (60 per hour by default); callback errors redirect back into the app with a short message and reveal nothing about accounts.
- Provider URLs are fixed constants, so these calls are not subject to the SSRF guard; they time out after 15 s.
## Admin web page

`/admin` (`ADMIN_WEB_UI`, default on) is a static page for replacing the Instagram session or cookies from a browser. It adds no server-side session: the admin token is typed in, kept in a JS variable, sent as a bearer token to the admin-only `/api/v1/sources/:id/credentials` routes, and dropped on log out, after 10 idle minutes or on `pagehide`. Nothing is written to cookies or web storage, so there is nothing for CSRF to ride on, and wrong tokens hit the same failed-auth rate limit and audit entries as any API call. The page uses `textContent` only, a hash-based CSP (`default-src 'none'`, `connect-src 'self'`, no `unsafe-inline`), `frame-ancestors 'none'`, `no-store` and `no-referrer`. Uploaded material is never returned by the API, logged or audited (only that a change happened).

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
