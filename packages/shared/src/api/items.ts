import { z } from "zod";
import { Availability, FetchStatus, ItemKind, MediaType, Workflow } from "./enums.ts";

export const MAX_URL_LENGTH = 2048;

export const CreateItemBody = z.object({
  url: z.string().trim().min(1).max(MAX_URL_LENGTH),
  folderIds: z.array(z.uuid()).max(100).optional(),
  tagIds: z.array(z.uuid()).max(100).optional(),
  notes: z.string().max(10_000).optional(),
});
export type CreateItemBody = z.infer<typeof CreateItemBody>;

/** Compact shape used in lists. */
export const ItemSummary = z.object({
  id: z.uuid(),
  title: z.string().nullable(),
  thumbUrl: z.string().nullable(),
  source: z.string(),
  kind: ItemKind,
  fetchStatus: FetchStatus,
  favorite: z.boolean(),
  savedAt: z.iso.datetime(),
  tagIds: z.array(z.uuid()),
});
export type ItemSummary = z.infer<typeof ItemSummary>;

export const MediaInfo = z.object({
  id: z.uuid(),
  position: z.number().int().nonnegative(),
  type: MediaType,
  url: z.string(),
  thumbUrl: z.string().nullable(),
  mime: z.string(),
  bytes: z.number().int().nonnegative(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  durationMs: z.number().int().nullable(),
});
export type MediaInfo = z.infer<typeof MediaInfo>;

export const ItemDetail = ItemSummary.extend({
  sourceUrl: z.string(),
  canonicalUrl: z.string(),
  sourceItemId: z.string().nullable(),
  authorHandle: z.string().nullable(),
  authorName: z.string().nullable(),
  authorUrl: z.string().nullable(),
  caption: z.string().nullable(),
  notes: z.string().nullable(),
  postedAt: z.iso.datetime().nullable(),
  fetchError: z.string().nullable(),
  availability: Availability,
  workflow: Workflow,
  rating: z.number().int().min(1).max(5).nullable(),
  media: z.array(MediaInfo),
});
export type ItemDetail = z.infer<typeof ItemDetail>;

export const ItemSort = z.enum(["saved_desc", "saved_asc", "posted_desc", "relevance"]);
export type ItemSort = z.infer<typeof ItemSort>;

const csv = <T extends z.ZodType>(item: T) =>
  z.preprocess((v) => (typeof v === "string" ? v.split(",").filter(Boolean) : v), z.array(item));

/** `GET /items` query. Multi-value params are comma-separated. */
export const ItemListQuery = z.object({
  q: z.string().max(500).optional(),
  folderId: z.uuid().optional(),
  includeSubfolders: z.stringbool().optional(),
  tagId: csv(z.uuid()).optional(),
  source: csv(z.string()).optional(),
  kind: csv(ItemKind).optional(),
  workflow: Workflow.optional(),
  favorite: z.stringbool().optional(),
  fetchStatus: FetchStatus.optional(),
  availability: Availability.optional(),
  sort: ItemSort.default("saved_desc"),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ItemListQuery = z.infer<typeof ItemListQuery>;

export const ItemListResponse = z.object({
  items: z.array(ItemSummary),
  nextCursor: z.string().nullable(),
});
export type ItemListResponse = z.infer<typeof ItemListResponse>;
