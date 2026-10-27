import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgTable, smallint, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, timestamptz, tsvector } from "./columns.ts";
import { ownerId } from "./users.ts";
import { availability, fetchStatus, itemKind, mediaType, visibility, workflow } from "./enums.ts";

export const items = pgTable(
  "items",
  {
    id: id(),
    userId: ownerId(),
    visibility: visibility().notNull().default("private"),
    // set by a moderator: the item stays with its owner but drops out of every public view
    hiddenAt: timestamptz(),
    sourceUrl: text().notNull(),
    canonicalUrl: text().notNull(),
    // registry id, validated in app code; not a pg enum so new sources need no migration
    source: text().notNull(),
    sourceItemId: text(),
    kind: itemKind().notNull().default("link"),
    authorHandle: text(),
    authorName: text(),
    authorUrl: text(),
    caption: text(),
    // comment a shared link pointed at (`SharedComment` in packages/shared), validated on read
    sharedComment: jsonb().$type<unknown>(),
    title: text(),
    notes: text(),
    postedAt: timestamptz(),
    savedAt: timestamptz().notNull().defaultNow(),
    fetchStatus: fetchStatus().notNull().default("pending"),
    fetchError: text(),
    fetchAttempts: integer().notNull().default(0),
    availability: availability().notNull().default("unknown"),
    availabilityCheckedAt: timestamptz(),
    workflow: workflow().notNull().default("inbox"),
    favorite: boolean().notNull().default(false),
    rating: smallint(),
    custom: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    rawMeta: jsonb().$type<unknown>(),
    transcript: text(),
    ocrText: text(),
    searchTsv: tsvector().generatedAlwaysAs(
      sql`setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(caption, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(notes, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(transcript, '')), 'C') ||
        setweight(to_tsvector('simple', coalesce(ocr_text, '')), 'C')`,
    ),
    createdAt: createdAt(),
    updatedAt: timestamptz()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("items_canonical_url_key").on(t.userId, t.canonicalUrl),
    uniqueIndex("items_source_item_key").on(t.userId, t.source, t.sourceItemId).where(sql`${t.sourceItemId} is not null`),
    index("items_public_idx").on(t.savedAt.desc()).where(sql`${t.visibility} = 'public'`),
    index("items_source_idx").on(t.source),
    index("items_saved_at_idx").on(t.userId, t.savedAt.desc()),
    index("items_workflow_idx").on(t.workflow),
    index("items_fetch_status_idx").on(t.fetchStatus).where(sql`${t.fetchStatus} <> 'ready'`),
    index("items_availability_checked_idx").on(t.availabilityCheckedAt.asc().nullsFirst()),
    index("items_favorite_idx").on(t.savedAt.desc()).where(sql`${t.favorite}`),
    index("items_search_idx").using("gin", t.searchTsv),
    index("items_title_trgm_idx").using("gin", t.title.op("gin_trgm_ops")),
    index("items_caption_trgm_idx").using("gin", t.caption.op("gin_trgm_ops")),
    index("items_author_handle_trgm_idx").using("gin", t.authorHandle.op("gin_trgm_ops")),
    check("items_rating_range", sql`${t.rating} between 1 and 5`),
  ],
);

export const media = pgTable(
  "media",
  {
    id: id(),
    itemId: uuid()
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    position: smallint().notNull(),
    type: mediaType().notNull(),
    storageKey: text().notNull(),
    thumbKey: text(),
    mime: text().notNull(),
    bytes: bigint({ mode: "number" }).notNull(),
    width: integer(),
    height: integer(),
    durationMs: integer(),
    sha256: text().notNull(),
  },
  (t) => [uniqueIndex("media_item_position_key").on(t.itemId, t.position)],
);
