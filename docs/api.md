# API

Base: `https://<host>/api/v1`. JSON in/out. All routes except `/health`, `POST /auth/login` and signed media require:

```
Authorization: Bearer <token>
```

where the token is the admin `API_TOKEN`, an account's generated token, or a session token (see [security.md](security.md)). Every route works inside the caller's own library. The admin may send `X-Magpie-Act-As: <account id>` to work inside another account's library.

Schemas are defined in `packages/shared/src/api/` — this page is the overview, the zod schemas are the source of truth.

Errors:

```json
{ "error": { "code": "not_found", "message": "Item not found" } }
```

Codes: `bad_request`, `unauthorized`, `forbidden`, `not_found`, `conflict`, `unsupported_url`, `rate_limited`, `internal`.

## Health

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | no auth; DB ping. `{ ok: true, version }` |

## Accounts

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | **no bearer.** `{ username, password }` → `{ token, me }` (a session token for this device). Rate limited |
| GET | `/me` | `{ id, name, displayName, isAdmin, hasPassword, actingAs }` |
| PATCH | `/me` | `{ displayName }` (`null` clears it). The username cannot change |
| PUT | `/me/password` | `{ password }` (10+ chars) → `{ token, me }`. Retires the temporary token, signs out other devices |
| POST | `/me/logout` | revokes the session token that made the call |
| GET | `/users` | **admin only.** All accounts with item counts |
| POST | `/users` | **admin only.** `{ name }` (the fixed username) → `201 { user, token }`; the token is shown once |
| POST | `/users/:id/token` | **admin only.** Reset: new temporary token, password removed, sessions revoked → `{ token }` |
| DELETE | `/users/:id` | **admin only.** Deletes the account, its library and its files. The admin account cannot be deleted |

## Sources

| Method | Path | Notes |
|---|---|---|
| GET | `/sources` | registry: `id`, `label`, `hosts`, item counts. Used for filters/icons. See [sources.md](sources.md) |

## Items

| Method | Path | Notes |
|---|---|---|
| POST | `/items` | `{ url, folderIds?, tagIds?, notes? }` → `202` new item, `200` if already saved (dedupe by canonical URL / source item id). Any public http(s) URL is accepted; unknown sites use the `generic` source. `422 unsupported_url` only for non-http(s) or blocked (private/internal) targets |
| GET | `/items` | list/search, cursor-paginated. Query: `q`, `folderId`, `includeSubfolders`, `tagId[]`, `source[]`, `kind[]`, `workflow`, `favorite`, `fetchStatus`, `availability`, `sort` (`saved_desc`, `saved_asc`, `posted_desc`, `relevance`), `cursor`, `limit` |
| GET | `/items/:id` | full item: media (with signed URLs), folders, tags, keywords, suggestions |
| PATCH | `/items/:id` | `title`, `notes`, `workflow`, `favorite`, `rating`, `custom` |
| DELETE | `/items/:id` | deletes item + blobs |
| POST | `/items/:id/refetch` | re-run pipeline (e.g. after failure) |
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
- `POST /items/bulk` ops: `addFolder`, `removeFolder`, `addTag`, `removeTag`, `setWorkflow`, `setFavorite`, `acceptSuggestions`, `refetch`, `delete` → `{ affected }`.

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
