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

## D5 — Static bearer token auth (2026-10-14)
Single user, project may be archived before a more complex setup is justified.
**Decision:** one long random `API_TOKEN`, constant-time compare, HTTPS only, rate-limited, audited. Separate secret for media URL signing.
**Consequences:** no per-device revocation (rotate the single token). Auth is isolated in one middleware for a future swap.

## D6 — Single-tenant schema (2026-10-14)
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
**Consequences:** release keystore lives in repo secrets and must be backed up; one changelog edit per user-visible change; Coolify can deploy pinned image tags instead of building on the host.

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
