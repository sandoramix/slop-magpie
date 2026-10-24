# Decisions

Lightweight decision log. Newest last. Format: context → decision → consequences.

## D1 — TypeScript everywhere (2026-10-14)
Owner wants a single, strongly typed language. Fetch tools (`yt-dlp`, `gallery-dl`) are Python, but expose JSON CLIs.
**Decision:** all project code is TypeScript; fetch tools run as subprocesses inside the worker image.
**Consequences:** one toolchain, shared types API↔app. Python exists only as a runtime in the worker image. Less fine-grained control (no progress hooks), acceptable.

## D2 — Expo (React Native), Android first (2026-10-14)
Android is the primary device; web and iOS should be possible later without a rewrite.
**Decision:** Expo + Expo Router, react-native-web for web later.
**Consequences:** iOS native needs a paid Apple developer account; web PWA + iOS Shortcut is the zero-cost route for Apple devices.

## D3 — Own backend on a Raspberry Pi with Coolify (2026-10-14)
Zero cost, lots of storage needed, residential IP is friendlier to Instagram than datacenter IPs. Firebase Storage now requires the Blaze plan.
**Decision:** self-host api + worker on the Pi; Postgres is an existing instance reached via `DATABASE_URL`.
**Consequences:** availability depends on the home server; backups are our responsibility.

## D4 — Local filesystem storage behind `BlobStore`, B2 later (2026-10-14)
**Decision:** local driver first (no object-storage server; MinIO community is unmaintained), S3 driver for Backblaze B2 later.
**Consequences:** media served by the API with HMAC-signed URLs; migration is a copy script + config switch.

## D5 — Static bearer token auth (2026-10-14) — extended by D23
Single user, project may be archived before a more complex setup is justified.
**Decision:** one long random `API_TOKEN`, constant-time compare, HTTPS only, rate-limited, audited. Separate secret for media URL signing.
**Consequences:** no per-device revocation (rotate the single token). Auth is isolated in one middleware for a future swap.

## D6 — Single-tenant schema (2026-10-14) — superseded by D23
**Decision:** no `user_id` columns.
**Consequences:** simpler queries; adding multi-user later requires a migration.

## D7 — pg-boss for jobs (2026-10-14)
**Decision:** use Postgres as the queue (pg-boss, own schema).
**Consequences:** no Redis on the Pi; job state is transactional with app data.

## D8 — Postgres search; pgvector optional (2026-10-14)
**Decision:** v1 uses built-in full-text + `pg_trgm`. Semantic search (`vector`) only if the existing instance supports it; schema must work without it.
**Consequences:** no hard dependency on a custom Postgres image.

## D9 — Organization model (2026-10-14)
Owner wants maximum flexibility.
**Decision:** independent dimensions — multi-membership nested folders, flat tags, keywords (auto + manual), typed custom fields, notes/flags/workflow, smart folders.
**Consequences:** richer UI work; auto-categorization writes `assigned_by = auto` assignments that the user can override.

## D10 — Source-agnostic fetching (2026-10-14)
Owner will save from more sites than Instagram/Pinterest.
**Decision:** pluggable source registry (shared `SourceDef` + worker `SourceFetcher`), reusable strategies (`yt-dlp`, `gallery-dl`, `opengraph`, `direct`), `generic` fallback for unknown sites. `items.source` is text, not an enum. Items without extractable media are kept as `kind = link`.
**Consequences:** any public URL is accepted, so an SSRF guard and LAN egress block for the worker are mandatory. Adding a site = two small files, no migration.

## D11 — t3-env for configuration (2026-10-14)
**Decision:** `@t3-oss/env-core` + zod in every app (`src/env.ts`), shared fragments in `packages/shared/src/env/`. Expo uses `EXPO_PUBLIC_` client prefix.
**Consequences:** typed config, fail-fast startup; `process.env` is not read elsewhere.

## D12 — Mobile UI: React Native Reusables + NativeWind (2026-10-14)
Owner wants a shadcn-like component library.
**Decision:** React Native Reusables (shadcn/ui port for RN, copy-paste components on rn-primitives) styled with NativeWind v4; lucide icons.
**Consequences:** components live in the repo and can be customized; same look on Android, web and iOS.

## D13 — Mobile state: TanStack Query + Zustand (2026-10-14)
**Decision:** TanStack Query for all server state (cache persisted to MMKV); Zustand + `persist` on MMKV for local UI state/preferences; `expo-secure-store` for the API token.
**Consequences:** clear split, no duplicated server data in stores; offline browsing of cached lists.

## D14 — Expo CNG, no committed native projects (2026-10-14)
Owner wants Expo + Expo Router for easy routing, development and deployment, without committing `android/` / `ios/`.
**Decision:** managed Expo with Continuous Native Generation: `expo prebuild` generates native dirs (gitignored); all native config in `app.config.ts` + config plugins; development builds via `expo-dev-client`; release via EAS Build (free tier) or local `expo run:android`.
**Consequences:** native config is reproducible from code; SDK upgrades are simpler. Any native tweak must be expressed as a config plugin. Expo Go is not usable (custom native modules).

## D15 — `dev` / `main` branches, manual SemVer (2026-10-14)
**Decision:** all work lands on `dev`; `main` is the release branch and only moves on an explicit release (merge `dev` → `main`, tag `vX.Y.Z`). Version is SemVer, edited by hand in one place (see D17); derived values (Android `versionCode`, API version) are computed from it.
**Consequences:** `main` always matches the latest release; one place to bump the version.

## D16 — Changelog file + tag-triggered GitHub releases (2026-10-14)
Owner's commit messages are not always conventional, so commit-derived changelogs are unreliable.
**Decision:** hand-written `CHANGELOG.md` (Keep a Changelog) is the single source for release notes and the in-app "What's new" (embedded at build time via `app.config.ts` `extra`). Pushing `v<version>` on `main` runs a GitHub Actions workflow: verify (tag = root `package.json` version, changelog entry, checks) → signed APK built on the runner (no EAS dependency) + ARM64 `api`/`worker` images to GHCR → GitHub release with notes, APK and checksums.
**Consequences:** release keystore lives in repo secrets and must be backed up; one changelog edit per user-visible change.
**Update (2026-10-17):** the GHCR image publishing was dropped; Coolify builds from `docker-compose.yml` and never pulled them, so the release workflow only builds the APK and triggers the deploy.

## D17 — Release version lives in the root `package.json` (2026-10-14)
Supersedes the `app.config.ts` location from D15. `app.config.ts` is code, so reading its version needs Expo's config loader; the API and CI need the version too.
**Decision:** `version` in the root `package.json` is the single source. `app.config.ts` reads it (and derives `versionCode`), api/worker import it as JSON (`src/version.ts`), CI reads it with `jq`. Workspace packages stay at `0.0.0`.
**Consequences:** plain JSON, readable everywhere without tooling; no `APP_VERSION` Docker build arg. The root `package.json` must be copied into server images (pnpm needs it anyway).

## D18 — Run TypeScript directly, no build step (2026-10-14)
Node 24 strips types natively (`scripts/changelog.ts` already relied on it).
**Decision:** api, worker and workspace packages run their `.ts` sources with plain `node`, in dev and in Docker; packages export `src/` instead of `dist/`. `tsc` only typechecks (`noEmit`).
**Consequences:** no bundler/emit config, no source maps to manage, identical code paths in dev and prod. Only erasable TS syntax is allowed (`erasableSyntaxOnly`), and relative imports carry `.ts`. Workspace packages must stay outside `node_modules` paths (pnpm symlinks resolve to the real path, so they do) because Node does not strip types under `node_modules`. TypeScript is pinned to 6.0 until typescript-eslint supports 7.

## D19 — Schema-validated fetch client instead of Hono RPC (2026-10-14)
`hc<AppType>` would make `apps/mobile` typecheck the API's Node sources and gives no runtime validation.
**Decision:** the app uses a small fetch client that parses every response with the zod schemas in `@magpie/shared/api`. `apps/api/src/app-type.ts` was removed.
**Consequences:** one source of truth (the schemas) on both sides; responses are checked at the boundary.

## D20 — Suggestions in their own tables (2026-10-14)
Suggestions below the auto-assign threshold must survive until the user accepts or dismisses them.
**Decision:** `item_folder_suggestions` / `item_tag_suggestions` with FKs, rebuilt by `categorize`. Rules learn only from `manual` assignments; accepting a suggestion makes it manual.
**Consequences:** deleting a folder/tag cleans up by cascade; dismissals are not learned.

## D21 — Integration tests use the DATABASE_URL server (2026-10-14)
Owner prefers one variable over a separate test URL.
**Decision:** vitest reads `DATABASE_URL` (env or root `.env`); each test file creates a `magpie_test_*` database on that server and drops it afterwards. Without it, integration tests are skipped.
**Consequences:** the role needs `CREATEDB`; the named database itself is never written by tests.

## D22 — Mobile conventions (2026-10-16)
**Decision:** Expo/Babel/Metro/Tailwind configs in `apps/mobile` are CommonJS (`*.cjs`; the package has no `"type": "module"`) because those tools load them with `require`. NativeWind forbids inline styles, so media aspect ratios snap to a fixed set of Tailwind `aspect-*` classes (`lib/media.ts`). `expo-share-intent` 8.0.1 declares `expo ^57` but is used on SDK 58 (prebuild verified). The update check reads GitHub's public `releases/latest` endpoint.
**Consequences:** card heights are approximate; no per-folder/tag colors in the UI (they would need inline styles).

## D23 — Accounts with isolated libraries (2026-10-16)
The owner wants to give other people their own archive on the same server.
**Decision:** `users` table; `user_id` on items, folders, tags, field_defs and smart_folders (migration 0003 backfills the existing data onto a fixed admin account). `API_TOKEN` is the admin credential and the admin is also a normal account with a library. The admin creates accounts (a fixed username and a generated token) and may act inside any account's library with the `X-Magpie-Act-As` header; writes done that way are audited (`admin.act_as`). People can change a display name but not their username.
**Credentials:** the generated token is temporary. Choosing a password (`PUT /me/password`) retires it and returns a session token for that device; other devices sign in with `POST /auth/login` (username + password, scrypt, 180-day sliding sessions, revocable, rate limited per IP and per username). "Forgot password" is an admin reset: new token, no password, all sessions revoked. **Roles:** `user` or `admin` is assigned when an account is created and can be changed by an admin. The root admin (the row behind `API_TOKEN`) keeps its token as its credential, alone or with an optional password, and its role and existence are protected; other admin accounts follow the normal token-then-password flow. Account tokens and session tokens are stored only as sha256 hashes.
**Consequences:** every query must be scoped by the owner; the worker's categorizer learns only from the same owner's items and duplicate detection is per account. Media URLs stay HMAC-signed and unauthenticated (unguessable keys, short TTL), so isolation relies on the item routes. The mobile app keeps several saved logins (server + token) on the device and offers account management to admins.

## D24 — Versioned, backward compatible API (2026-10-16)
Phones keep old app builds for months and the server is redeployed on every release, so a server change must not strand an installed app.
**Decision:** routes are versioned in the path (`/api/v1`, later `/api/v2`). Inside a version only additive changes are allowed; breaking changes get a new version mounted beside the old one, which stays until a release deliberately retires it. Database migrations must not break the previous version. Rules and examples in [api.md](api.md#versioning).
**Consequences:** a breaking change costs a second route set and shared schemas for the new version, and old versions need tests for as long as they are served. Accounts (0.2.0) were done this way inside v1: old builds that send `API_TOKEN` keep working as the admin.

## D25 — Tappable invites, deleted-account notice, in-app dialogs, two share targets (2026-10-16)
**Invites.** Chat apps only link `http(s)` text, so `magpie://` invites were dead text. The invite now carries `https://<server>/invite#…`; the API serves a static landing page (outside `/api/v1`, nothing to version) that turns the URL fragment into the app link. The fragment keeps the token out of server and proxy logs; the page has a hash-based CSP and uses `textContent` only. Android App Links were not used: they need a verified `assetlinks.json` per domain and the signing fingerprint. Old invite messages (`magpie://` only) still parse.
**Deleted accounts.** Deleting an account stores the hashes of its token and sessions in `deleted_tokens` (a year). A 401 for such a token carries `error.reason = "account_deleted"` (additive; the code stays `unauthorized` so old builds behave as before). The app removes the account and tells the person on the next request. Fresh logins for a deleted username fail like a wrong password, so usernames stay private.
**Dialogs.** Android's native `Alert` shows at most three buttons and ignores the back button unless `cancelable`. The admin menu had five, so "Delete account" never appeared. `lib/alert.ts` wraps `Alert.alert` (always cancelable) and opens menus with more than three buttons in an in-app sheet with a close button. Deleting an account takes a warning prompt, then typing the username (two steps; an earlier version had a third "really?" prompt).
**Share targets.** Android lists each exported activity with a SEND filter, so a local config plugin (`plugins/with-quick-save-share.ts`) adds "Magpie: save for later": a small trampoline activity that forwards the share to `MainActivity` with a marker in `EXTRA_TITLE` (which `expo-share-intent` exposes as `meta.title`). That entry always saves to the Inbox and returns to the previous app; plain "Magpie" follows Settings > Sharing (organize now by default, or ask).
**License.** MIT.

## D26 — Server-only releases skip the APK (2026-10-17)
Most fixes touch only the API or worker, and an APK build takes about 30 minutes.
**Decision:** the release workflow diffs the tag against the last release that shipped an APK over the paths the app is built from; with no changes it skips the Android job and leaves the release a pre-release. Details in [releases.md](releases.md#server-only-releases).
**Consequences:** the root version can run ahead of the installed app version; the in-app "What's new" shows server-only entries with the next app build.

## D27 — Per-account storage limit (2026-10-17)
One account could fill the Pi's disk.
**Decision:** `users.storage_limit_bytes` (default 50 GB, null = unlimited), changed by an admin through `PATCH /users/:id`. Usage is the sum of `media.bytes` (originals only; thumbnails are small and untracked), computed on demand. At the limit, `POST /items` answers `403 forbidden` and the worker fails a fetch whose files would overflow it. Errors reuse existing codes so older app builds still parse them (D24).
**Consequences:** lowering a limit below current use deletes nothing; it only blocks new data. The check is not atomic, so concurrent fetches can overshoot by the size of one item.

## D28 — Automatic Instagram login (2026-10-20)
Exported browser cookies for Instagram kept dying, so `instagram.txt` had to be re-uploaded often.
**Decision:** a new `instaloader` strategy (external CLI; it writes the media, a caption `.txt` and a metadata `.json` into a temp dir, which the strategy reads) runs first for Instagram. It logs in with `INSTAGRAM_USERNAME` / `INSTAGRAM_PASSWORD` (password on stdin) and keeps its session file in a writable `SESSIONS_DIR`; later runs reuse it. The worker allows one password use per source every 15 minutes (in memory, per process), and only when there is no session or a run failed with an auth error. Tried and dropped: password login through `gallery-dl` (unsupported since 1.32; `-j` never exports cookies) and a hand-written web login in TypeScript (Instagram answers it with checkpoints and it needs an undocumented endpoint). yt-dlp and gallery-dl keep using the manual `instagram.txt` as fallback.
**Consequences:** one server-owned Instagram account serves every user; no user ever supplies cookies or credentials. The password sits in the worker env. instaloader downloads the media itself (like yt-dlp), so the SSRF guard and the size cap do not apply to those downloads. A flagged account stops working until the owner resolves it on Instagram. Accounts with 2FA or a checkpoint fail the login and keep using the manual file. A flagged account stops working until the owner resolves it on the Instagram side; use a secondary account.

## D29 — Instagram resilience instead of a fix (2026-10-24)
Instagram revokes sessions and flags server-side logins on purpose, so no single method stays working (D28 shipped five releases of replacing one login method with another).
**Decision:** accept that the session will die and make that cheap: a 6-hourly `session-check` that renews or flags it and re-fetches what was saved meanwhile; `opengraph` with a link-preview crawler User-Agent as the last strategy, so saves during an outage keep caption, author and preview; daily self-update of yt-dlp / gallery-dl / instaloader into the sessions volume, rolled back if the new set does not start.
**Consequences:** during an outage Instagram saves are `link` items with a preview until recovery. A browser-created session (instaloader `--load-cookies`) remains the most durable credential. Nothing here is verified against a live logged-in account; the OpenGraph shape was checked on a public profile only.
