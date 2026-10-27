import { z } from "zod";
import { FeedbackReason, FeedbackVerdict, ItemKind, ReportStatus, ReportTarget } from "./enums.ts";
import { Name } from "./common.ts";
import { MediaInfo } from "./items.ts";
import { MeResponse } from "./users.ts";

const cursorQuery = {
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
};

/** Public name of an account. */
export const PersonRef = z.object({ id: z.uuid(), name: z.string(), displayName: z.string().nullable() });
export type PersonRef = z.infer<typeof PersonRef>;

/** How people rated an item. `reasons` is only filled for the item's owner. */
export const FeedbackSummary = z.object({
  total: z.number().int().nonnegative(),
  worked: z.number().int().nonnegative(),
  meh: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  reasons: z.record(z.string(), z.number().int().nonnegative()),
});
export type FeedbackSummary = z.infer<typeof FeedbackSummary>;

export const MyFeedback = z.object({
  verdict: FeedbackVerdict,
  reasons: z.array(FeedbackReason),
  updatedAt: z.iso.datetime(),
});
export type MyFeedback = z.infer<typeof MyFeedback>;

/** A public item as a card in feeds, explore, profiles and saved lists. */
export const PostSummary = z.object({
  id: z.uuid(),
  title: z.string().nullable(),
  thumbUrl: z.string().nullable(),
  source: z.string(),
  kind: ItemKind,
  aspectRatio: z.number().positive().nullable(),
  mediaCount: z.number().int().nonnegative(),
  owner: PersonRef,
  /** Null for a private item of the caller's own. */
  publishedAt: z.iso.datetime().nullable(),
  likeCount: z.number().int().nonnegative(),
  saveCount: z.number().int().nonnegative(),
  feedback: FeedbackSummary,
  likedByMe: z.boolean(),
  savedByMe: z.boolean(),
  mine: z.boolean(),
});
export type PostSummary = z.infer<typeof PostSummary>;

export const PostDetail = PostSummary.extend({
  canonicalUrl: z.string(),
  authorHandle: z.string().nullable(),
  authorName: z.string().nullable(),
  authorUrl: z.string().nullable(),
  caption: z.string().nullable(),
  media: z.array(MediaInfo),
  myFeedback: MyFeedback.nullable(),
  triedByMe: z.boolean(),
  /** Set when the caller saved it. */
  save: z.object({ id: z.uuid(), note: z.string().nullable(), folderIds: z.array(z.uuid()), tagIds: z.array(z.uuid()) }).nullable(),
});
export type PostDetail = z.infer<typeof PostDetail>;

export const PostListResponse = z.object({ posts: z.array(PostSummary), nextCursor: z.string().nullable() });
export type PostListResponse = z.infer<typeof PostListResponse>;

export const FeedQuery = z.object(cursorQuery);
export type FeedQuery = z.infer<typeof FeedQuery>;

export const exploreSorts = ["recent", "popular"] as const;
export const ExploreQuery = z.object({
  sort: z.enum(exploreSorts).default("recent"),
  q: z.string().trim().max(200).optional(),
  source: z.string().max(50).optional(),
  ...cursorQuery,
});
export type ExploreQuery = z.infer<typeof ExploreQuery>;

/** How many accounts saved the caller's post, for the warning before un-publishing or deleting it. */
export const SaverCountResponse = z.object({ count: z.number().int().nonnegative() });
export type SaverCountResponse = z.infer<typeof SaverCountResponse>;

// ── saves ───────────────────────────────────────────────────────────────

export const SaveSummary = PostSummary.extend({
  saveId: z.uuid(),
  note: z.string().nullable(),
  savedAt: z.iso.datetime(),
  folderIds: z.array(z.uuid()),
  tagIds: z.array(z.uuid()),
});
export type SaveSummary = z.infer<typeof SaveSummary>;

export const SaveListQuery = z.object({
  folderId: z.uuid().optional(),
  tagId: z.uuid().optional(),
  /** Saves with no folder and no tag yet. */
  unfiled: z.stringbool().optional(),
  q: z.string().trim().max(200).optional(),
  ...cursorQuery,
});
export type SaveListQuery = z.infer<typeof SaveListQuery>;

export const SaveListResponse = z.object({ saves: z.array(SaveSummary), nextCursor: z.string().nullable() });
export type SaveListResponse = z.infer<typeof SaveListResponse>;

/** Partial: only the keys present change. */
export const UpdateSaveBody = z
  .object({
    note: z.string().max(10_000).nullable(),
    folderIds: z.array(z.uuid()).max(100),
    tagIds: z.array(z.uuid()).max(100),
  })
  .partial();
export type UpdateSaveBody = z.infer<typeof UpdateSaveBody>;

// ── people ──────────────────────────────────────────────────────────────

export const Profile = PersonRef.extend({
  bio: z.string().nullable(),
  joinedAt: z.iso.datetime(),
  postCount: z.number().int().nonnegative(),
  followerCount: z.number().int().nonnegative(),
  followingCount: z.number().int().nonnegative(),
  followedByMe: z.boolean(),
  blockedByMe: z.boolean(),
  isMe: z.boolean(),
});
export type Profile = z.infer<typeof Profile>;

export const ProfileParam = z.object({ name: z.string().min(1).max(100) });
export type ProfileParam = z.infer<typeof ProfileParam>;

export const PeopleSearchQuery = z.object({ q: z.string().trim().min(1).max(100) });
export type PeopleSearchQuery = z.infer<typeof PeopleSearchQuery>;
export const PeopleResponse = z.object({ people: z.array(Profile) });
export type PeopleResponse = z.infer<typeof PeopleResponse>;

export const UpdateProfileBody = z.object({ bio: z.string().trim().max(500).nullable() });
export type UpdateProfileBody = z.infer<typeof UpdateProfileBody>;

// ── notifications ───────────────────────────────────────────────────────

export const notificationTypes = ["post_removed", "post_unshared", "new_follower", "post_saved", "feedback_received"] as const;
export const NotificationType = z.enum(notificationTypes);
export type NotificationType = z.infer<typeof NotificationType>;

export const Notification = z.object({
  id: z.uuid(),
  type: NotificationType,
  /** Free-form per type: `title`, `itemId` (gone for the removal types), `person` (name of who did it). */
  payload: z.object({ title: z.string().nullable().optional(), itemId: z.string().optional(), person: z.string().optional(), verdict: z.string().optional() }),
  read: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type Notification = z.infer<typeof Notification>;

export const NotificationListQuery = z.object({ unread: z.stringbool().optional(), ...cursorQuery });
export type NotificationListQuery = z.infer<typeof NotificationListQuery>;
export const NotificationListResponse = z.object({
  notifications: z.array(Notification),
  unreadCount: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
});
export type NotificationListResponse = z.infer<typeof NotificationListResponse>;

/** Omitted `ids` marks everything read. */
export const MarkReadBody = z.object({ ids: z.array(z.uuid()).max(200).optional() });
export type MarkReadBody = z.infer<typeof MarkReadBody>;

// ── feedback ────────────────────────────────────────────────────────────

export const SetFeedbackBody = z.object({
  verdict: FeedbackVerdict,
  reasons: z.array(FeedbackReason).max(8).default([]),
});
export type SetFeedbackBody = z.infer<typeof SetFeedbackBody>;

/** Days after saving an item before "how did it go?" is asked once, and how long "not yet" waits. */
export const FEEDBACK_PROMPT_AFTER_DAYS = 3;
export const FEEDBACK_SNOOZE_DAYS = 7;

export const FeedbackPromptsResponse = z.object({ prompts: z.array(PostSummary) });
export type FeedbackPromptsResponse = z.infer<typeof FeedbackPromptsResponse>;

export const DashboardProgress = z.object({
  itemsImported: z.number().int().nonnegative(),
  /** Imported items filed in at least one folder or tag, as 0..1. */
  filedShare: z.number().min(0).max(1),
  publicItems: z.number().int().nonnegative(),
  savesFromOthers: z.number().int().nonnegative(),
  followers: z.number().int().nonnegative(),
  following: z.number().int().nonnegative(),
  feedbackGiven: z.number().int().nonnegative(),
  feedbackReceived: z.number().int().nonnegative(),
  /** Share of verdicts on my posts that said "worked", null before the first one. */
  helpfulShare: z.number().min(0).max(1).nullable(),
  /** Saves and tried items still waiting for a verdict. */
  awaitingFeedback: z.number().int().nonnegative(),
  /** Consecutive weeks (including this one) with at least one import, save or verdict. */
  activeWeeks: z.number().int().nonnegative(),
});
export type DashboardProgress = z.infer<typeof DashboardProgress>;

export const feedbackTabs = ["given", "received"] as const;
export const DashboardFeedbackQuery = z.object({
  tab: z.enum(feedbackTabs).default("given"),
  verdict: FeedbackVerdict.optional(),
  itemId: z.uuid().optional(),
  ...cursorQuery,
});
export type DashboardFeedbackQuery = z.infer<typeof DashboardFeedbackQuery>;

export const FeedbackEntry = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
  itemTitle: z.string().nullable(),
  thumbUrl: z.string().nullable(),
  verdict: FeedbackVerdict,
  reasons: z.array(FeedbackReason),
  updatedAt: z.iso.datetime(),
  /** Who gave it; only on the "received" tab. */
  by: PersonRef.nullable(),
});
export type FeedbackEntry = z.infer<typeof FeedbackEntry>;

export const DashboardFeedbackResponse = z.object({ entries: z.array(FeedbackEntry), nextCursor: z.string().nullable() });
export type DashboardFeedbackResponse = z.infer<typeof DashboardFeedbackResponse>;

// ── signup, invites ─────────────────────────────────────────────────────

export const registrationModes = ["invite", "open"] as const;
export const RegistrationMode = z.enum(registrationModes);
export type RegistrationMode = z.infer<typeof RegistrationMode>;

/** Social logins the app may offer. A provider is listed in `RegistrationConfig.providers` only when the server has it configured. */
export const oauthProviders = ["google", "github", "discord"] as const;
export const OAuthProvider = z.enum(oauthProviders);
export type OAuthProvider = z.infer<typeof OAuthProvider>;

export const RegistrationConfig = z.object({
  mode: RegistrationMode,
  /** Absent on servers that predate social login. */
  providers: z.array(OAuthProvider).default([]),
});
export type RegistrationConfig = z.infer<typeof RegistrationConfig>;

export const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,32}$/;

export const SignupBody = z.object({
  username: z.string().trim().regex(USERNAME_PATTERN, "3-32 letters, digits, _ . -"),
  password: z.string().min(10).max(200),
  inviteCode: z.string().trim().max(100).optional(),
});
export type SignupBody = z.infer<typeof SignupBody>;

// ── social login ────────────────────────────────────────────────────────

/** Where the browser is sent back to; the app registers this scheme (`app.config.ts`). */
export const OAUTH_APP_REDIRECT = "magpie://oauth";

/** The page to open in the system browser. */
export const OAuthStartResponse = z.object({ url: z.url() });
export type OAuthStartResponse = z.infer<typeof OAuthStartResponse>;

/**
 * `ticket` is what the callback handed to the app. A first-time identity has no account yet: the first
 * answer is `signup_required` with a suggested name, and the app asks again with `username` (and the
 * invite code when the server is invite-only).
 */
export const OAuthExchangeBody = z.object({
  ticket: z.string().min(20).max(200),
  username: z.string().trim().regex(USERNAME_PATTERN, "3-32 letters, digits, _ . -").optional(),
  inviteCode: z.string().trim().max(100).optional(),
});
export type OAuthExchangeBody = z.infer<typeof OAuthExchangeBody>;

export const OAuthExchangeResponse = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), token: z.string(), me: z.lazy(() => MeResponse) }),
  z.object({ status: z.literal("signup_required"), provider: OAuthProvider, suggestedUsername: z.string(), inviteRequired: z.boolean() }),
]);
export type OAuthExchangeResponse = z.infer<typeof OAuthExchangeResponse>;

export const LinkedIdentity = z.object({
  provider: OAuthProvider,
  email: z.string().nullable(),
  linkedAt: z.iso.datetime(),
  lastLoginAt: z.iso.datetime().nullable(),
});
export type LinkedIdentity = z.infer<typeof LinkedIdentity>;

export const IdentitiesResponse = z.object({
  identities: z.array(LinkedIdentity),
  hasPassword: z.boolean(),
});
export type IdentitiesResponse = z.infer<typeof IdentitiesResponse>;

export const ProviderParam = z.object({ provider: OAuthProvider });
export type ProviderParam = z.infer<typeof ProviderParam>;

export const InviteResponse = z.object({ code: z.string(), expiresAt: z.iso.datetime() });
export type InviteResponse = z.infer<typeof InviteResponse>;

// ── safety ──────────────────────────────────────────────────────────────

export const CreateReportBody = z.object({
  target: ReportTarget,
  /** An item id or an account name, matching `target`. */
  targetId: z.string().min(1).max(100),
  reason: Name.max(500),
});
export type CreateReportBody = z.infer<typeof CreateReportBody>;

export const Report = z.object({
  id: z.uuid(),
  target: ReportTarget,
  itemId: z.uuid().nullable(),
  itemTitle: z.string().nullable(),
  targetUser: z.string().nullable(),
  reporter: z.string(),
  reason: z.string(),
  status: ReportStatus,
  createdAt: z.iso.datetime(),
});
export type Report = z.infer<typeof Report>;

export const ReportListQuery = z.object({ status: ReportStatus.default("open"), ...cursorQuery });
export type ReportListQuery = z.infer<typeof ReportListQuery>;
export const ReportListResponse = z.object({ reports: z.array(Report), nextCursor: z.string().nullable() });
export type ReportListResponse = z.infer<typeof ReportListResponse>;

/** Admin: act on a report. `hide` hides the item, `suspend` suspends the account, `dismiss` closes it without action. */
export const ResolveReportBody = z.object({ action: z.enum(["hide", "suspend", "dismiss"]) });
export type ResolveReportBody = z.infer<typeof ResolveReportBody>;

export const BlockedResponse = z.object({ people: z.array(PersonRef) });
export type BlockedResponse = z.infer<typeof BlockedResponse>;
