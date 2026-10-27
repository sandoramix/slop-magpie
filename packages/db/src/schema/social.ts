import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, timestamptz } from "./columns.ts";
import { feedbackVerdict, reportStatus, reportTarget } from "./enums.ts";
import { items } from "./items.ts";
import { folders, tags } from "./organize.ts";
import { ownerId, users } from "./users.ts";

const itemRef = () =>
  uuid()
    .notNull()
    .references(() => items.id, { onDelete: "cascade" });

const userRef = () =>
  uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

/** A bookmark on someone else's public item (D31). Removed with the item (D32). */
export const itemSaves = pgTable(
  "item_saves",
  {
    id: id(),
    userId: ownerId(),
    itemId: itemRef(),
    note: text(),
    savedAt: createdAt(),
    // "how did it go?" is not asked again before this moment
    feedbackSnoozedUntil: timestamptz(),
  },
  (t) => [uniqueIndex("item_saves_user_item_key").on(t.userId, t.itemId), index("item_saves_item_idx").on(t.itemId)],
);

export const saveFolders = pgTable(
  "save_folders",
  {
    saveId: uuid()
      .notNull()
      .references(() => itemSaves.id, { onDelete: "cascade" }),
    folderId: uuid()
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    addedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.saveId, t.folderId] }), index("save_folders_folder_idx").on(t.folderId)],
);

export const saveTags = pgTable(
  "save_tags",
  {
    saveId: uuid()
      .notNull()
      .references(() => itemSaves.id, { onDelete: "cascade" }),
    tagId: uuid()
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    addedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.saveId, t.tagId] }), index("save_tags_tag_idx").on(t.tagId)],
);

export const follows = pgTable(
  "follows",
  {
    followerId: userRef(),
    followeeId: userRef(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followeeId] }),
    index("follows_followee_idx").on(t.followeeId),
    check("follows_not_self", sql`${t.followerId} <> ${t.followeeId}`),
  ],
);

export const itemLikes = pgTable(
  "item_likes",
  {
    userId: userRef(),
    itemId: itemRef(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemId] }), index("item_likes_item_idx").on(t.itemId)],
);

/** One verdict per person and item; changeable. `reasons` holds `FeedbackReason` values. */
export const itemFeedback = pgTable(
  "item_feedback",
  {
    id: id(),
    userId: userRef(),
    itemId: itemRef(),
    verdict: feedbackVerdict().notNull(),
    reasons: text().array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
    updatedAt: timestamptz()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("item_feedback_user_item_key").on(t.userId, t.itemId), index("item_feedback_item_idx").on(t.itemId)],
);

/** Set when someone says "I tried it"; the feedback prompt then follows. */
export const itemTried = pgTable(
  "item_tried",
  {
    userId: userRef(),
    itemId: itemRef(),
    triedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemId] })],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: ownerId(),
    // validated against `NotificationType` in packages/shared when read
    type: text().notNull(),
    payload: jsonb().$type<unknown>().notNull().default({}),
    readAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt.desc())],
);

export const blocks = pgTable(
  "blocks",
  {
    blockerId: userRef(),
    blockedId: userRef(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    index("blocks_blocked_idx").on(t.blockedId),
    check("blocks_not_self", sql`${t.blockerId} <> ${t.blockedId}`),
  ],
);

export const reports = pgTable(
  "reports",
  {
    id: id(),
    reporterId: userRef(),
    target: reportTarget().notNull(),
    // exactly one of these matches `target`; the target going away keeps the report with the id nulled
    itemId: uuid().references(() => items.id, { onDelete: "set null" }),
    targetUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    reason: text().notNull(),
    status: reportStatus().notNull().default("open"),
    createdAt: createdAt(),
    resolvedAt: timestamptz(),
  },
  (t) => [index("reports_status_idx").on(t.status, t.createdAt)],
);

/** Single-use signup codes (`REGISTRATION_MODE=invite`). Only the hash is stored. */
export const invites = pgTable(
  "invites",
  {
    id: id(),
    codeHash: text().notNull(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    expiresAt: timestamptz().notNull(),
    usedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    usedAt: timestamptz(),
  },
  (t) => [uniqueIndex("invites_code_hash_key").on(t.codeHash)],
);
