import { z } from "zod";
import { AssignedBy, Availability, FetchStatus, ItemKind, KeywordSource, MediaType, Workflow } from "./enums.ts";

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
  workflow: Workflow,
  availability: Availability,
  authorHandle: z.string().nullable(),
  /** width / height of the first media, for the masonry grid. */
  aspectRatio: z.number().positive().nullable(),
  mediaCount: z.number().int().nonnegative(),
  suggestionCount: z.number().int().nonnegative(),
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

export const ItemFolderRef = z.object({
  id: z.uuid(),
  name: z.string(),
  assignedBy: AssignedBy,
  confidence: z.number().nullable(),
});
export type ItemFolderRef = z.infer<typeof ItemFolderRef>;

export const ItemTagRef = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.string().nullable(),
  assignedBy: AssignedBy,
  confidence: z.number().nullable(),
});
export type ItemTagRef = z.infer<typeof ItemTagRef>;

export const ItemKeyword = z.object({
  keyword: z.string(),
  source: KeywordSource,
  weight: z.number(),
});
export type ItemKeyword = z.infer<typeof ItemKeyword>;

export const Suggestion = z.object({
  id: z.uuid(),
  name: z.string(),
  confidence: z.number(),
});
export type Suggestion = z.infer<typeof Suggestion>;

export const ItemSuggestions = z.object({
  folders: z.array(Suggestion),
  tags: z.array(Suggestion),
});
export type ItemSuggestions = z.infer<typeof ItemSuggestions>;

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
  fetchAttempts: z.number().int().nonnegative(),
  availability: Availability,
  availabilityCheckedAt: z.iso.datetime().nullable(),
  workflow: Workflow,
  rating: z.number().int().min(1).max(5).nullable(),
  custom: z.record(z.string(), z.unknown()),
  media: z.array(MediaInfo),
  folders: z.array(ItemFolderRef),
  tags: z.array(ItemTagRef),
  keywords: z.array(ItemKeyword),
  suggestions: ItemSuggestions,
});
export type ItemDetail = z.infer<typeof ItemDetail>;

/** `POST /items`: the item plus whether it was already saved. */
export const CreateItemResponse = z.object({
  item: ItemDetail,
  duplicate: z.boolean(),
});
export type CreateItemResponse = z.infer<typeof CreateItemResponse>;

export const UpdateItemBody = z
  .object({
    title: z.string().trim().max(500).nullable(),
    notes: z.string().max(10_000).nullable(),
    workflow: Workflow,
    favorite: z.boolean(),
    rating: z.number().int().min(1).max(5).nullable(),
    /** Partial: keys present are set (`null` removes), others are kept. Validated against field definitions. */
    custom: z.record(z.string(), z.unknown()),
  })
  .partial();
export type UpdateItemBody = z.infer<typeof UpdateItemBody>;

export const SetItemFoldersBody = z.object({ folderIds: z.array(z.uuid()).max(100) });
export type SetItemFoldersBody = z.infer<typeof SetItemFoldersBody>;

export const SetItemTagsBody = z.object({ tagIds: z.array(z.uuid()).max(100) });
export type SetItemTagsBody = z.infer<typeof SetItemTagsBody>;

export const AddKeywordBody = z.object({ keyword: z.string().trim().min(1).max(100) });
export type AddKeywordBody = z.infer<typeof AddKeywordBody>;

export const DeleteKeywordQuery = z.object({ source: KeywordSource.optional() });
export type DeleteKeywordQuery = z.infer<typeof DeleteKeywordQuery>;

/** Accept or dismiss suggestions. Omitted lists mean "all" for accept-all / dismiss-all. */
export const SuggestionsBody = z.object({
  folderIds: z.array(z.uuid()).max(100).optional(),
  tagIds: z.array(z.uuid()).max(100).optional(),
});
export type SuggestionsBody = z.infer<typeof SuggestionsBody>;

export const BulkOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("addFolder"), folderId: z.uuid() }),
  z.object({ op: z.literal("removeFolder"), folderId: z.uuid() }),
  z.object({ op: z.literal("addTag"), tagId: z.uuid() }),
  z.object({ op: z.literal("removeTag"), tagId: z.uuid() }),
  z.object({ op: z.literal("setWorkflow"), workflow: Workflow }),
  z.object({ op: z.literal("setFavorite"), favorite: z.boolean() }),
  z.object({ op: z.literal("acceptSuggestions") }),
  z.object({ op: z.literal("refetch") }),
  z.object({ op: z.literal("suggest") }),
  z.object({ op: z.literal("delete") }),
]);
export type BulkOp = z.infer<typeof BulkOp>;

export const BulkBody = z.object({ ids: z.array(z.uuid()).min(1).max(500) }).and(BulkOp);
export type BulkBody = z.infer<typeof BulkBody>;

export const BulkResponse = z.object({ affected: z.number().int().nonnegative() });
export type BulkResponse = z.infer<typeof BulkResponse>;

export const ItemSort = z.enum(["saved_desc", "saved_asc", "posted_desc", "relevance"]);
export type ItemSort = z.infer<typeof ItemSort>;

/** Structured filters, JSON-safe. Stored by smart folders; `GET /items` parses its query string into this. */
export const ItemFilter = z.object({
  q: z.string().max(500).optional(),
  folderId: z.uuid().optional(),
  includeSubfolders: z.boolean().optional(),
  tagIds: z.array(z.uuid()).max(100).optional(),
  sources: z.array(z.string().max(50)).max(50).optional(),
  kinds: z.array(ItemKind).optional(),
  workflow: Workflow.optional(),
  favorite: z.boolean().optional(),
  fetchStatus: FetchStatus.optional(),
  availability: Availability.optional(),
  /** Only items with pending suggestions. */
  hasSuggestions: z.boolean().optional(),
});
export type ItemFilter = z.infer<typeof ItemFilter>;

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
  hasSuggestions: z.stringbool().optional(),
  /** Applies the smart folder's saved filter, ANDed with the other params. */
  smartFolderId: z.uuid().optional(),
  sort: ItemSort.default("saved_desc"),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ItemListQuery = z.infer<typeof ItemListQuery>;
/** Input type (before defaults/coercion), e.g. for building URLs on the client. */
export type ItemListParams = z.input<typeof ItemListQuery>;

export function filterFromListQuery(q: ItemListQuery): ItemFilter {
  const f: ItemFilter = {};
  if (q.q !== undefined && q.q.trim() !== "") f.q = q.q;
  if (q.folderId !== undefined) f.folderId = q.folderId;
  if (q.includeSubfolders !== undefined) f.includeSubfolders = q.includeSubfolders;
  if (q.tagId?.length) f.tagIds = q.tagId;
  if (q.source?.length) f.sources = q.source;
  if (q.kind?.length) f.kinds = q.kind;
  if (q.workflow !== undefined) f.workflow = q.workflow;
  if (q.favorite !== undefined) f.favorite = q.favorite;
  if (q.fetchStatus !== undefined) f.fetchStatus = q.fetchStatus;
  if (q.availability !== undefined) f.availability = q.availability;
  if (q.hasSuggestions !== undefined) f.hasSuggestions = q.hasSuggestions;
  return f;
}

/** Inverse of `filterFromListQuery`, for clients building `GET /items` URLs. */
export function listParamsFromFilter(f: ItemFilter): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.q) p.q = f.q;
  if (f.folderId) p.folderId = f.folderId;
  if (f.includeSubfolders !== undefined) p.includeSubfolders = String(f.includeSubfolders);
  if (f.tagIds?.length) p.tagId = f.tagIds.join(",");
  if (f.sources?.length) p.source = f.sources.join(",");
  if (f.kinds?.length) p.kind = f.kinds.join(",");
  if (f.workflow) p.workflow = f.workflow;
  if (f.favorite !== undefined) p.favorite = String(f.favorite);
  if (f.fetchStatus) p.fetchStatus = f.fetchStatus;
  if (f.availability) p.availability = f.availability;
  if (f.hasSuggestions !== undefined) p.hasSuggestions = String(f.hasSuggestions);
  return p;
}

export const ItemListResponse = z.object({
  items: z.array(ItemSummary),
  nextCursor: z.string().nullable(),
});
export type ItemListResponse = z.infer<typeof ItemListResponse>;

/** Ids of unsorted items that look like the one asked about. */
export const SimilarResponse = z.object({ ids: z.array(z.uuid()) });
export type SimilarResponse = z.infer<typeof SimilarResponse>;
