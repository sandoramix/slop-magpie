# Releases

`main` is the release branch and `dev` is where work happens (see [AGENTS.md](../AGENTS.md#branches-and-releases)). Pushing a `v<major>.<minor>.<patch>` tag on `main` triggers [`.github/workflows/release.yml`](../.github/workflows/release.yml). The workflow builds the Android APK and the server images and publishes a GitHub release.

## Version

The single source of truth is `version` in the root `package.json`, edited by hand. Workspace packages keep `0.0.0` (they are private and never published). Everything else is derived from the root value:

| Consumer | How |
|---|---|
| App `version` | `app.config.ts` reads the root `package.json` |
| Android `versionCode` | `major * 10000 + minor * 100 + patch`, computed in `app.config.ts` |
| CI / release | the workflow reads `package.json`; the pushed tag only triggers it and must equal `v<version>` |
| API / worker | `src/version.ts` imports the root `package.json` (it is part of every image); returned by `GET /health`, logged at start |

Bump rules: **patch** for fixes only, **minor** for new features or behavior changes, **major** for breaking changes (an API change that old app builds can't handle, a manual migration, or removed features).

## Changelog

[`CHANGELOG.md`](../CHANGELOG.md) follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). It is the only source for release notes. Commits are not parsed, so commit messages can be written in any style.

- Every user-visible change on `dev` adds a bullet under `## [Unreleased]`, in one of these sections: `Added`, `Changed`, `Fixed`, `Removed`, `Security`.
- Write for the user of the app, not the developer. Use "Save links from the share sheet", not "feat(api): POST /items".
- If an upgrade needs a manual step (an env var, a config change), add an `### Upgrade notes` section to that entry.
- Before a release, compare `git log <last tag>..dev` with `[Unreleased]` and fill in anything missing.

`scripts/changelog.ts` handles the file (plain `node`, no install needed):

```sh
node scripts/changelog.ts check 1.2.0     # fails unless [1.2.0] exists and is non-empty
node scripts/changelog.ts notes 1.2.0     # prints the entry body (used for the GitHub release)
node scripts/changelog.ts release 1.2.0   # renames [Unreleased] to [1.2.0] - <today>, opens a new [Unreleased]
node scripts/changelog.ts json            # all entries as JSON
```

### In the app

At build time, `app.config.ts` runs `node ../../scripts/changelog.ts json` (`execFileSync`, so it doesn't matter how Expo loads the config file) and puts the released entries (without `Unreleased`) into `extra.changelog`. The app reads `Constants.expoConfig.extra.changelog`, validates it with the zod schema in `packages/shared`, and shows it:

- **Settings → What's new**: every version, newest first, grouped by section.
- **After an update**: if the installed version is newer than `lastSeenVersion` (Zustand, persisted), a sheet shows the entries in between, and then `lastSeenVersion` is updated.

The changelog is bundled, so it works offline and always matches the installed build.

### Update check

`lib/updates.ts` calls `GET https://api.github.com/repos/<owner>/<repo>/releases/latest` (repo slug in `app.config.ts` `extra.githubRepo`), compares the tag with the installed version and, when newer, offers it in Settings and as a banner on the library screen. Tapping it downloads the `.apk` asset into the app cache with a progress readout (`lib/install-update.ts`, `expo-file-system`) and opens Android's package installer through a content URI (`expo-intent-launcher`); the manifest needs `REQUEST_INSTALL_PACKAGES`, and Android asks once to allow installs from Magpie. It installs over the existing app because releases share one signing key; a debug or differently signed build must be uninstalled first. A 404 (no release yet, or a private repo) is treated as "up to date".

## What CI does

On a pushed `v*.*.*` tag:

1. **verify**: the tag must be on `main`, the tag must equal the root `package.json` `version`, the changelog entry must exist, and typecheck, lint and test must pass.
2. **release**: right after verify, creates the GitHub release `Magpie <version>` with the changelog entry, install instructions and a compare link, so the page exists immediately. It starts as a **pre-release**, because the app's update check reads `releases/latest`, which skips pre-releases: phones keep seeing the previous version until the APK is attached. The android job promotes it to the latest release as its last step. If that job fails, the release stays a pre-release; fix the build and re-run the job, or promote it by hand (`gh release edit vX.Y.Z --prerelease=false --latest`) once the APK is attached.
3. **android** (after release; skipped for server-only releases, see below): `expo prebuild`, then `gradlew assembleRelease`, signed with the release keystore from repository secrets, then attaches `magpie-<version>.apk` and `SHA256SUMS` to the release. It builds every ABI. Two caches keep it fast: the Gradle build cache (`setup-gradle`) and ccache for the native C++ compile (`actions/cache`). GitHub scopes caches by ref and a tag run can only read caches from its own ref or from `main`, so the tag run only **restores**; [`android-cache.yml`](../.github/workflows/android-cache.yml) builds on `main` (when it moves at a release, weekly so unused caches are not evicted after 7 days, or by hand from the Actions tab) and saves them. Until that workflow has run once on `main`, the next release builds cold (about 30 minutes); the first release after that reads the warm caches. Check `ccache --show-stats` at the end of the "Build release APK" step: hits should be well above 0%.
4. **images** (parallel to android): `api` and `worker` images built natively on an ARM64 runner and pushed to GHCR as `ghcr.io/<owner>/<repo>-<app>:<version>` and `:latest`.
5. **deploy** (after images, does not wait for the APK): calls the Coolify deploy webhook ([`deploy.yml`](../.github/workflows/deploy.yml)), so the server redeploys. Coolify rebuilds the branch configured in the resource, so point the resource at `main`.

If **verify** fails, nothing is created. If **android** fails, the release stays without an APK; re-run the job. If only **deploy** fails, re-run it or run **Deploy** by hand from the Actions tab.

### Server-only releases

verify diffs the tag against the tag `releases/latest` points at (the last release that shipped an APK) over `apps/mobile`, `packages/shared` (except `src/env`, which only the server reads), `scripts/changelog.ts`, `pnpm-workspace.yaml` and `.nvmrc`. No changes means **android** is skipped: images and deploy still run, the release page says there is no new APK, and the release stays a **pre-release**, so `releases/latest` (the update check in the app) keeps pointing at the last app release and no phone is offered an update without an APK. The next release that changes the app builds a normal APK with the current version and is promoted to latest. Edit the path list in the "Did the app change?" step to adjust.

## One-time setup

### 1. Android signing keystore

Android only installs an update over an existing app if both are signed with the same key. Generate the key once and **back it up outside the repo** (a password manager, for example). If you lose it, every user has to uninstall and reinstall the app.

```sh
keytool -genkeypair -v \
  -keystore magpie-release.jks \
  -alias magpie \
  -keyalg RSA -keysize 4096 -validity 10000
```

### 2. Repository secrets

```sh
base64 -w0 magpie-release.jks | gh secret set ANDROID_KEYSTORE_BASE64
gh secret set ANDROID_KEYSTORE_PASSWORD     # prompts for the value
gh secret set ANDROID_KEY_ALIAS --body magpie
gh secret set ANDROID_KEY_PASSWORD
```

On macOS, use `base64 -i magpie-release.jks` instead of `base64 -w0`. `GITHUB_TOKEN` covers the release and GHCR.

### 3. GHCR package visibility

After the first release, the images appear under the repository's **Packages**. To pull them without logging in, set each package's visibility to public. Otherwise, run `docker login ghcr.io` on the server with a token that has the `read:packages` scope.

### 4. Coolify deploy webhook

The **Deploy** workflow needs two more repository secrets:

- `COOLIFY_WEBHOOK`: the resource's deploy URL, from Coolify → resource → **Webhooks** (`https://<coolify>/api/v1/deploy?uuid=<resource uuid>&force=false`).
- `COOLIFY_TOKEN`: a Coolify API token with the **deploy** permission (Coolify → **Keys & Tokens** → API tokens). API access must be enabled in Coolify's settings.

```sh
gh secret set COOLIFY_WEBHOOK   # paste the URL
gh secret set COOLIFY_TOKEN     # paste the token
```

## How to release

The owner says "release" (or runs these steps by hand):

```sh
git switch dev && git pull

# 1. Choose the bump (patch / minor / major), then edit `version` in the root package.json by hand.

# 2. Turn [Unreleased] into the new entry and check it.
node scripts/changelog.ts release 1.2.0
git diff CHANGELOG.md

# 3. Make sure everything passes, then commit.
pnpm typecheck && pnpm lint && pnpm test
git commit -am "chore(release): v1.2.0"

# 4. Merge into main, tag, push.
git switch main && git pull
git merge --no-ff dev -m "release: v1.2.0"
git tag -a v1.2.0 -m "v1.2.0"
git push origin main dev v1.2.0

git switch dev
```

Then follow the run with `gh run watch` (or in the **Actions** tab). When it finishes, the release appears under **Releases**.

The server redeploys automatically through the **deploy** job. Install the APK from the release page on the phone.

### If the workflow fails

- **Tag/version mismatch or missing changelog entry:** fix it on `dev`, merge into `main` again, then move the tag:
  ```sh
  git push origin :refs/tags/v1.2.0 && git tag -d v1.2.0
  git tag -a v1.2.0 -m "v1.2.0" && git push origin v1.2.0
  ```
- **Build or infrastructure failure** (flaky runner, registry): re-run the failed jobs from the Actions tab. No new tag is needed.
- **Already published but broken:** don't move a published tag. Ship a patch release (`1.2.1`).
