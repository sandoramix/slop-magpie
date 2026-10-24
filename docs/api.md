# API

Base: `https://<host>/api/v1`. JSON in/out. All routes except `/health`, `POST /auth/login` and signed media require:

```
Authorization: Bearer <token>
```

where the token is the admin `API_TOKEN`, an account's generated token, or a session token (see [security.md](security.md)). Every route works inside the caller's own library. The admin may send `X-Magpie-Act-As: <account id>` to work inside another account's library.

## Versioning

Every route lives under `/api/v<N>`; this page documents `v1`. The mobile app is installed by hand and updates late, so **a released API version must keep working for old clients** ([D24](decisions.md)).

- **Allowed inside a version:** new routes, new optional response fields, new optional request fields or query params, new enum values the old client can ignore, new error codes on new routes.
- **Breaking, needs a new version:** removing or renaming a route or field, making an input required, changing a type or meaning, changing status codes or the `{ error }` shape, or changing what an existing call returns for the same input.
- **How:** mount `/api/v2` next to `/api/v1` (routes in `apps/api/src/routes/v2/`, shared schemas in `packages/shared/src/api/v2/`) and keep v1 untouched. Share services where behavior is identical; adapt at the route layer, not by editing v1 schemas. Both versions stay covered by integration tests.
- **Retiring a version:** only in a release whose changelog says so (with an upgrade note), after the app no longer calls it; answer `410 Gone` with the code `bad_request` and a message pointing to the new version for one release before removing it.
- **Database:** migrations must keep the previous version working. Add columns and tables in one release; rename or drop in a later one, after the old version is gone.
- **Clients:** the app calls a single base path constant per version; `GET /health` is unversioned (`/api/v1/health` today) so an app can still tell how old a server is.

Schemas are defined in `packages/shared/src/api/` — this page is the overview, the zod schemas are the source of truth.

Errors:

```json
{ "error": { "code": "not_found", "message": "Item not found" } }
```

Codes: `bad_request`, `unauthorized`, `forbidden`, `not_found`, `conflict`, `unsupported_url`, `rate_limited`, `internal`.

A `401` may also carry `"reason": "account_deleted"` inside `error` when the token belonged to an account an admin has since deleted. The code stays `unauthorized`, so builds that predate `reason` behave as before; the app uses it to tell the person why they were signed out.

## Health

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | no auth; DB ping. `{ ok: true, version }` |

## Invite page

Not part of the versioned API. `GET /invite` (no auth, static HTML) is the page an invite link points at: `https://<server>/invite#url=…&username=…&token=…`. Chat apps only make `http(s)` text tappable, so the page turns the fragment into the `magpie://connect?…` link behind an "Open in Magpie" button and links to the latest APK. The details live in the URL fragment, which browsers never send, so the token stays out of server and proxy logs. Served with `Cache-Control: no-store` and a hash-based `Content-Security-Policy` (no `unsafe-inline`).

## Accounts

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | **no bearer.** `{ username, password }` → `{ token, me }` (a session token for this device). Rate limited |
| GET | `/me` | `{ id, name, displayName, isAdmin, hasPassword, actingAs, storage }`; `storage` is `{ usedBytes, limitBytes }` (`limitBytes: null` = unlimited) for the library the request works in |
| PATCH | `/me` | `{ displayName }` (`null` clears it). The username cannot change |
| PUT | `/me/password` | `{ password }` (10+ chars) → `{ token, me }`. Retires the temporary token, signs out other devices. The root admin gets `token: null` and keeps `API_TOKEN` |
| POST | `/me/logout` | revokes the session token that made the call |
| GET | `/users` | **admin only.** All accounts with item counts, `storage` (`{ usedBytes, limitBytes }`) and `hasPassword` (false while an invite is still pending) |
| POST | `/users` | **admin only.** `{ name, role? }` (the fixed username; `role` is `user` (default) or `admin`) → `201 { user, token }`; the token is shown once |
| PATCH | `/users/:id` | **admin only.** `{ role?, storageLimitBytes? }`, at least one. `role` promotes or demotes (not the root admin, not yourself). `storageLimitBytes` sets the account's storage cap in bytes, `null` removes it (allowed for any account, including the root admin) |
| POST | `/users/:id/token` | **admin only.** Reset: new temporary token, password removed, sessions revoked → `{ token }` |
| DELETE | `/users/:id` | **admin only.** Deletes the account, its library and its files. Not the root admin, not yourself. The hashes of its tokens and sessions are kept (`deleted_tokens`, one year) so its devices get `reason: "account_deleted"` |

## Sources

| Method | Path | Notes |
|---|---|---|
| GET | `/sources` | registry: `id`, `label`, `hosts`, item counts. Used for filters/icons. See [sources.md](sources.md) |

## Items

| Method | Path | Notes |
|---|---|---|
| POST | `/items` | `{ url, folderIds?, tagIds?, notes? }` → `202` new item, `200` if already saved (dedupe by canonical URL / source item id). Any public http(s) URL is accepted; unknown sites use the `generic` source. `422 unsupported_url` only for non-http(s) or blocked (private/internal) targets. `403 forbidden` when the library is at its storage limit (new saves are refused until space is freed or the limit raised) |
| GET | `/items` | list/search, cursor-paginated. Query: `q`, `folderId`, `includeSubfolders`, `tagId[]`, `source[]`, `kind[]`, `workflow`, `favorite`, `fetchStatus`, `availability`, `sort` (`saved_desc`, `saved_asc`, `posted_desc`, `relevance`), `cursor`, `limit` |
| GET | `/items/:id` | full item: media (with signed URLs), folders, tags, keywords, suggestions |
| PATCH | `/items/:id` | `title`, `notes`, `workflow`, `favorite`, `rating`, `custom` |
| DELETE | `/items/:id` | deletes item + blobs |
| POST | `/items/:id/refetch` | re-run pipeline (e.g. after failure) |
| POST | `/items/refetch-failed` | re-run every failed item of the account → `{ affected }` (202) |
| POST | `/items/refresh-suggestions` | re-extract keywords and suggestions for every ready item → `{ affected }` (202) |
| PUT | `/items/:id/folders` | `{ folderIds }` — replaces manual assignments |
| PUT | `/items/:id/tags` | `{ tagIds }` |
| POST | `/items/:id/keywords` | `{ keyword }` manual |
| DELETE | `/items/:id/keywords/:keyword` | `?source=` |
| POST | `/items/:id/suggestions/accept` | `{ folderIds?, tagIds? }` turns suggestions into manual assignments |
| POST | `/items/:id/suggestions/dismiss` | `{ folderIds?, tagIds? }` drops suggestions |
| POST | `/items/bulk` | `{ ids, op }` — op: `addFolder`, `removeFolder`, `addTag`, `removeTag`, `setWorkflow`, `delete` |

List items return a compact shape (`ItemSummary`: `id`, `title`, `thumbUrl`, `source`, `kind`, `fetchStatus`, `favorite`, `savedAt`, `tagIds`, `workflow`, `availability`, `authorHandle`, `aspectRatio`, `mediaCount`, `suggestionCount`).

Notes on the item routes:
- `POST /items` answers `{ item, duplicate }`. On a duplicate, the given `folderIds`/`tagIds` are still linked to the existing item.
- `GET /items` also takes `hasSuggestions` and `smartFolderId` (the smart folder's saved filter is ANDed with the other params). `q` uses the query language in `packages/shared/src/query/parse.ts` (also `-` negation, `field:key=value`, `field:key>3`, `saved:2026-01..2026-03`, `saved:7d`). `sort=relevance` without free text falls back to `saved_desc`.
- `PUT /items/:id/folders` / `tags` replace **all** assignments (manual and auto); ids already assigned keep their `assignedBy`, new ones are `manual`.
- `POST /items/:id/suggestions/accept` and `/dismiss` take `{ folderIds?, tagIds? }`: both omitted = all suggestions, one list given = only those. Accepted suggestions become manual assignments.
- `POST /items/bulk` ops: `addFolder`, `removeFolder`, `addTag`, `removeTag`, `setWorkflow`, `setFavorite`, `acceptSuggestions`, `refetch`, `suggest` (re-extract and re-suggest), `delete` → `{ affected }`.

## Folders

| Method | Path | Notes |
|---|---|---|
| GET | `/folders` | flat list (`parentId`, `position`, direct `itemCount`); build the tree with `buildFolderTree` from `@magpie/shared/api` |
| POST | `/folders` | `{ name, parentId?, icon?, color? }` |
| PATCH | `/folders/:id` | rename, recolor, move (`parentId`), reorder (`position`) — cycle-checked |
| DELETE | `/folders/:id` | deletes subtree links, never items |

## Tags

| Method | Path | Notes |
|---|---|---|
| GET | `/tags` | with item counts |
| POST | `/tags` | `{ name, color? }` |
| PATCH | `/tags/:id` | |
| DELETE | `/tags/:id` | |
| POST | `/tags/:id/merge` | `{ intoTagId }` — moves links, deletes source tag |

## Custom fields

| Method | Path | Notes |
|---|---|---|
| GET | `/fields` | |
| POST | `/fields` | `{ key, label, type, options? }` |
| PATCH | `/fields/:id` | |
| DELETE | `/fields/:id` | removes key from all `items.custom` |

## Smart folders

| Method | Path | Notes |
|---|---|---|
| GET | `/smart-folders` | |
| POST | `/smart-folders` | `{ name, query }` |
| PATCH | `/smart-folders/:id` | |
| DELETE | `/smart-folders/:id` | |

## Stats

| Method | Path | Notes |
|---|---|---|
| GET | `/stats` | totals, favorites, gone, items with suggestions, counts by workflow and fetch status |

## Media

| Method | Path | Notes |
|---|---|---|
| GET | `/media/*key?exp=<unix>&sig=<b64url>` | **no bearer** — authorized by HMAC signature. Supports `Range`. `Cache-Control: private, max-age` until `exp` |

Signed URLs are embedded in item responses (`thumbUrl`, `media[].url`, `media[].thumbUrl`). Default TTL: 1 h. See [storage.md](storage.md).

## Rate limits

- Failed auth: 10 / 15 min per IP, then `429` + `audit_log` entry.
- `POST /items`: 60 / min.
