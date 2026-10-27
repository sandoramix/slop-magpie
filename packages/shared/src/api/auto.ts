import { z } from "zod";

// ── stop terms ──────────────────────────────────────────────────────────

export const StopTermsResponse = z.object({ terms: z.array(z.string()) });
export type StopTermsResponse = z.infer<typeof StopTermsResponse>;

/** Stored in canonical spelling (see `canonicalKeyword`); a term is one word or a short phrase. */
export const AddStopTermBody = z.object({ term: z.string().trim().min(2).max(60) });
export type AddStopTermBody = z.infer<typeof AddStopTermBody>;

export const StopTermParam = z.object({ term: z.string().min(1).max(60) });

// ── topics ──────────────────────────────────────────────────────────────

export const Topic = z.object({
  /** The words most of its items share, e.g. "bread · baking". */
  label: z.string(),
  keywords: z.array(z.string()),
  size: z.number().int().positive(),
  /** Items of this topic that are in no folder and have no tag. */
  unfiledCount: z.number().int().nonnegative(),
  /** Up to 200, newest first. */
  itemIds: z.array(z.uuid()),
});
export type Topic = z.infer<typeof Topic>;

export const TopicsQuery = z.object({ unfiled: z.stringbool().optional() });
export type TopicsQuery = z.infer<typeof TopicsQuery>;

export const TopicsResponse = z.object({
  topics: z.array(Topic),
  /** Items that have an embedding / items that finished downloading; the rest are picked up by "Refresh suggestions". */
  analysed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type TopicsResponse = z.infer<typeof TopicsResponse>;

// ── automatic filing, reviewed ──────────────────────────────────────────

export const AutoFiledEntry = z.object({
  itemId: z.uuid(),
  title: z.string().nullable(),
  thumbUrl: z.string().nullable(),
  folders: z.array(z.object({ id: z.uuid(), name: z.string() })),
  tags: z.array(z.object({ id: z.uuid(), name: z.string() })),
  filedAt: z.iso.datetime(),
});
export type AutoFiledEntry = z.infer<typeof AutoFiledEntry>;

/** Items the categorizer filed on its own in the last two weeks and the person has not confirmed or undone. */
export const AUTO_FILED_WINDOW_DAYS = 14;

export const AutoFiledResponse = z.object({ entries: z.array(AutoFiledEntry), count: z.number().int().nonnegative() });
export type AutoFiledResponse = z.infer<typeof AutoFiledResponse>;

/** Omitted `itemIds` means every pending item. */
export const AutoFiledActionBody = z.object({ itemIds: z.array(z.uuid()).min(1).max(500).optional() });
export type AutoFiledActionBody = z.infer<typeof AutoFiledActionBody>;

export const AutoFiledActionResponse = z.object({ affected: z.number().int().nonnegative() });
export type AutoFiledActionResponse = z.infer<typeof AutoFiledActionResponse>;

// ── moderation: what is currently restricted ────────────────────────────

export const HiddenItem = z.object({
  id: z.uuid(),
  title: z.string().nullable(),
  owner: z.string(),
  hiddenAt: z.iso.datetime(),
});
export type HiddenItem = z.infer<typeof HiddenItem>;
export const HiddenItemsResponse = z.object({ items: z.array(HiddenItem) });
export type HiddenItemsResponse = z.infer<typeof HiddenItemsResponse>;

export const SuspendedAccount = z.object({ id: z.uuid(), name: z.string(), suspendedAt: z.iso.datetime() });
export type SuspendedAccount = z.infer<typeof SuspendedAccount>;
export const SuspendedAccountsResponse = z.object({ accounts: z.array(SuspendedAccount) });
export type SuspendedAccountsResponse = z.infer<typeof SuspendedAccountsResponse>;
