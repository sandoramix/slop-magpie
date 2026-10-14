import type { SmartFolderQuery } from "@magpie/shared/api";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, timestamptz } from "./columns.ts";
import { assignedBy, fieldType, keywordSource } from "./enums.ts";
import { items } from "./items.ts";

export const folders = pgTable(
  "folders",
  {
    id: id(),
    parentId: uuid().references((): AnyPgColumn => folders.id, { onDelete: "cascade" }),
    name: text().notNull(),
    icon: text(),
    color: text(),
    position: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    // coalesce makes root folders (parent_id null) unique by name too
    uniqueIndex("folders_parent_name_key").on(
      sql`coalesce(${t.parentId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`lower(${t.name})`,
    ),
  ],
);

export const itemFolders = pgTable(
  "item_folders",
  {
    itemId: uuid()
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    folderId: uuid()
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    assignedBy: assignedBy().notNull().default("manual"),
    confidence: real(),
    addedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.folderId] }), index("item_folders_folder_idx").on(t.folderId)],
);

export const tags = pgTable(
  "tags",
  {
    id: id(),
    name: text().notNull(),
    color: text(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tags_name_key").on(sql`lower(${t.name})`)],
);

export const itemTags = pgTable(
  "item_tags",
  {
    itemId: uuid()
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    tagId: uuid()
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    assignedBy: assignedBy().notNull().default("manual"),
    confidence: real(),
    addedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.tagId] }), index("item_tags_tag_idx").on(t.tagId)],
);

export const itemKeywords = pgTable(
  "item_keywords",
  {
    itemId: uuid()
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    keyword: text().notNull(),
    source: keywordSource().notNull(),
    weight: real().notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.keyword, t.source] }), index("item_keywords_keyword_idx").on(t.keyword)],
);

export const fieldDefs = pgTable(
  "field_defs",
  {
    id: id(),
    key: text().notNull(),
    label: text().notNull(),
    type: fieldType().notNull(),
    options: jsonb().$type<string[]>(),
    position: integer().notNull().default(0),
  },
  (t) => [uniqueIndex("field_defs_key_key").on(t.key)],
);


export const smartFolders = pgTable("smart_folders", {
  id: id(),
  name: text().notNull(),
  icon: text(),
  color: text(),
  query: jsonb().$type<SmartFolderQuery>().notNull(),
  position: integer().notNull().default(0),
});

// Suggestions below AUTO_ASSIGN_THRESHOLD, waiting for accept/dismiss. Two tables (not one
// polymorphic one) so deleting a folder/tag cascades.
export const itemFolderSuggestions = pgTable(
  "item_folder_suggestions",
  {
    itemId: uuid()
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    folderId: uuid()
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    confidence: real().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.folderId] })],
);

export const itemTagSuggestions = pgTable(
  "item_tag_suggestions",
  {
    itemId: uuid()
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    tagId: uuid()
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    confidence: real().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.tagId] })],
);
