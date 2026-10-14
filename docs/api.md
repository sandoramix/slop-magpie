# API

Base: `https://<host>/api/v1`. JSON in/out. All routes except `/health` and signed media require:

```
Authorization: Bearer <API_TOKEN>
```

Schemas are defined in `packages/shared/src/api/` — this page is the overview, the zod schemas are the source of truth.

Errors:

```json
{ "error": { "code": "not_found", "message": "Item not found" } }
```

Codes: `bad_request`, `unauthorized`, `not_found`, `conflict`, `unsupported_url`, `rate_limited`, `internal`.

## Health

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | no auth; DB ping. `{ ok: true, version }` |

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
| POST | `/items/bulk` | `{ ids, op }` — op: `addFolder`, `removeFolder`, `addTag`, `removeTag`, `setWorkflow`, `delete` |

List items return a compact shape (`id`, `title`, `thumbUrl`, `source`, `kind`, `fetchStatus`, `favorite`, `savedAt`, `tagIds`).

## Folders

| Method | Path | Notes |
|---|---|---|
| GET | `/folders` | full tree with item counts |
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

## Media

| Method | Path | Notes |
|---|---|---|
| GET | `/media/*key?exp=<unix>&sig=<b64url>` | **no bearer** — authorized by HMAC signature. Supports `Range`. `Cache-Control: private, max-age` until `exp` |

Signed URLs are embedded in item responses (`thumbUrl`, `media[].url`, `media[].thumbUrl`). Default TTL: 1 h. See [storage.md](storage.md).

## Rate limits

- Failed auth: 10 / 15 min per IP, then `429` + `audit_log` entry.
- `POST /items`: 60 / min.
