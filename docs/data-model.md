# Data model

PostgreSQL via Drizzle. Single-tenant: no `user_id` columns. All IDs are UUIDv7. All timestamps are `timestamptz`.

Extensions: `pg_trgm` (required, v1). `vector` (optional, v2 semantic search — only if available on the instance).

## Entity overview

```
items ──< media
  │
  ├──< item_folders >── folders (self-referencing tree)
  ├──< item_tags    >── tags
  ├──< item_keywords
  └── custom (jsonb) ── validated against field_defs

smart_folders   (saved queries)
audit_log       (security/accounting events)
pgboss.*        (job queue, managed by pg-boss)
```

## Tables

### items
One saved piece of content (a reel, a post, a carousel, a pin).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| source_url | text | URL as shared |
| canonical_url | text UNIQUE | normalized; dedupe key |
| source | text | source id from the registry (`instagram`, `tiktok`, `generic`, ...). Text, not enum — new sources need no migration. See [sources.md](sources.md) |
| source_item_id | text | ID on the source (shortcode etc.), nullable. Unique `(source, source_item_id)` when present |
| kind | enum `item_kind` | `video`, `image`, `gallery`, `link` (no media extractable — bookmark with preview) |
| author_handle | text | |
| author_name | text | |
| author_url | text | |
| caption | text | original caption / description |
| title | text | user-editable display title (defaults from source title or caption) |
| notes | text | user notes |
| posted_at | timestamptz | from source |
| saved_at | timestamptz | default now() |
| fetch_status | enum `fetch_status` | `pending`, `fetching`, `ready`, `failed` |
| fetch_error | text | last error message |
| fetch_attempts | int | default 0 |
| availability | enum `availability` | original still online: `available`, `gone`, `unknown` |
| availability_checked_at | timestamptz | last availability check |
| workflow | enum `workflow` | `inbox`, `to_try`, `done`, `reference` — default `inbox` |
| favorite | boolean | default false |
| rating | smallint | 1–5, nullable |
| custom | jsonb | custom field values, keyed by `field_defs.key` |
| raw_meta | jsonb | full fetcher JSON (trimmed), for future re-processing |
| transcript | text | v2 (whisper) |
| ocr_text | text | v2 (tesseract) |
| search_tsv | tsvector | generated; see Search |
| embedding | vector(384) | v2, optional |
| created_at / updated_at | timestamptz | |

Indexes: `canonical_url` unique, `(source, source_item_id)` unique partial, `source`, `saved_at desc`, `workflow`, `favorite` partial, GIN on `search_tsv`, GIN trigram on `title`, `caption`, `author_handle`.

### media
Files belonging to an item. A carousel has several rows.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| item_id | uuid FK → items ON DELETE CASCADE | |
| position | smallint | order inside carousel, 0-based |
| type | enum `media_type` | `video`, `image` |
| storage_key | text | BlobStore key of the original |
| thumb_key | text | BlobStore key of the WebP thumbnail |
| mime | text | |
| bytes | bigint | |
| width / height | int | |
| duration_ms | int | video only |
| sha256 | text | integrity + dedupe |

Unique `(item_id, position)`.

### folders
Nested tree. An item can be in **many** folders (folders behave like hierarchical labels with a tree UI).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| parent_id | uuid FK → folders ON DELETE CASCADE, nullable | null = root |
| name | text | |
| icon | text | emoji or icon name |
| color | text | hex |
| position | int | manual ordering among siblings |
| created_at | timestamptz | |

Unique `(coalesce(parent_id, <nil uuid>), lower(name))` — the coalesce makes root names unique too, on any Postgres version. Cycles prevented in the API (move checks ancestry with a recursive CTE).

### item_folders

| Column | Type | Notes |
|---|---|---|
| item_id | uuid FK | |
| folder_id | uuid FK | |
| assigned_by | enum `assigned_by` | `manual`, `auto` |
| confidence | real | for `auto`; null for `manual` |
| added_at | timestamptz | |

PK `(item_id, folder_id)`. Auto suggestions below the confidence threshold are **not** inserted; they are returned as suggestions only.

> Naming: `assigned_by` (who linked it) is distinct from `items.source` (which site the item came from).

### item_folder_suggestions / item_tag_suggestions
Categorizer output below `AUTO_ASSIGN_THRESHOLD`, waiting for accept/dismiss: `item_id`, `folder_id` / `tag_id` (FK, cascade), `confidence`, `created_at`. PK `(item_id, folder_id|tag_id)`. Two tables rather than one polymorphic table so deleting a folder or tag cascades. Rebuilt for an item each time `categorize` runs.

### tags / item_tags
Flat labels.

- `tags`: `id`, `name` (unique, case-insensitive), `color`, `created_at`.
- `item_tags`: `item_id`, `tag_id`, `assigned_by`, `confidence`, `added_at`. PK `(item_id, tag_id)`.

### item_keywords
Search/findability terms. Not a managed vocabulary like tags.

| Column | Type | Notes |
|---|---|---|
| item_id | uuid FK | |
| keyword | text | lowercased, normalized |
| source | enum `keyword_source` | `hashtag`, `caption`, `transcript`, `ocr`, `manual` |
| weight | real | relevance score |

PK `(item_id, keyword, source)`. Users can delete auto keywords and add manual ones.

### field_defs
Definitions for typed custom fields.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| key | text UNIQUE | slug, used in `items.custom` |
| label | text | |
| type | enum `field_type` | `text`, `number`, `boolean`, `date`, `duration`, `url`, `select`, `multiselect` |
| options | jsonb | choices for select types |
| position | int | |

Values in `items.custom` are validated by the API against `field_defs` (zod schema built at runtime).

### smart_folders
Saved searches shown alongside folders.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | |
| icon / color | text | |
| query | jsonb | `ItemQuery` from `packages/shared` (same shape as `GET /items` filters) |
| position | int | |

### audit_log

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| at | timestamptz | |
| action | text | e.g. `auth.fail`, `item.delete`, `folder.delete` |
| ip | inet | |
| user_agent | text | |
| details | jsonb | never contains secrets |

Retention: prune entries older than 180 days (worker cron).

## Search

`items.search_tsv` is a generated column:

```sql
setweight(to_tsvector('simple', coalesce(title,'')), 'A') ||
setweight(to_tsvector('simple', coalesce(caption,'')), 'B') ||
setweight(to_tsvector('simple', coalesce(notes,'')), 'B') ||
setweight(to_tsvector('simple', coalesce(transcript,'')), 'C') ||
setweight(to_tsvector('simple', coalesce(ocr_text,'')), 'C')
```

`simple` config because content is mixed Italian/English; stemming per language is a later improvement (`italian` + `english` configs combined).

Keywords, author and tag names are matched separately and merged in the query. Fuzzy fallback uses `pg_trgm` similarity on `title`, `caption`, `author_handle`.

Query language (`q` param, parsed in `packages/shared`):

```
pasta limone tag:cibo folder:"Ricette/Primi" is:fav status:to_try from:@author source:instagram kind:video saved:>2026-01-01
```

## Deletion

- Deleting an item deletes DB rows (cascade) and enqueues blob deletion.
- Deleting a folder deletes its subtree and the `item_folders` links — never items.
- Deleting a tag removes links only.
