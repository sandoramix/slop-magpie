import {
  DashboardFeedbackResponse,
  BlockedResponse,
  IdentitiesResponse,
  InviteResponse,
  OAuthStartResponse,
  ReportListResponse,
  type OAuthProvider,
  type ResolveReportBody,
  DashboardProgress,
  FeedbackPromptsResponse,
  NotificationListResponse,
  PeopleResponse,
  PostDetail,
  PostListResponse,
  Profile,
  SaveListResponse,
  SaverCountResponse,
  type DashboardFeedbackQuery,
  type SetFeedbackBody,
  type UpdateSaveBody,
} from "@magpie/shared/api";
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { request } from "./api";
import { useScope } from "./queries";
import { useAccounts } from "@/stores/accounts";

const NoContent = z.null();
const PAGE = 30;

export type DiscoverMode = "following" | "recent" | "popular";

export function useDiscover(mode: DiscoverMode, q: string) {
  const [scope, enabled] = useScope();
  return useInfiniteQuery({
    queryKey: ["posts", scope, "discover", mode, q],
    enabled,
    initialPageParam: undefined as string | undefined,
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam }) =>
      request("GET", mode === "following" ? "/feed" : "/explore", {
        schema: PostListResponse,
        query: {
          ...(mode === "following" ? {} : { sort: mode, ...(q.trim() ? { q: q.trim() } : {}) }),
          ...(pageParam ? { cursor: pageParam } : {}),
          limit: PAGE,
        },
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function usePost(id: string) {
  const [scope, enabled] = useScope();
  return useQuery({ queryKey: ["post", scope, id], enabled, queryFn: () => request("GET", `/posts/${id}`, { schema: PostDetail }) });
}

export function useSimilarPosts(id: string) {
  const [scope, enabled] = useScope();
  return useQuery({
    queryKey: ["posts", scope, "similar", id],
    enabled,
    queryFn: async () => (await request("GET", `/posts/${id}/similar`, { schema: PostListResponse })).posts,
  });
}

export function useSavedPosts(filter: { folderId?: string; tagId?: string; unfiled?: boolean; q?: string }) {
  const [scope, enabled] = useScope();
  return useInfiniteQuery({
    queryKey: ["posts", scope, "saves", filter],
    enabled,
    initialPageParam: undefined as string | undefined,
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam }) =>
      request("GET", "/saves", {
        schema: SaveListResponse,
        query: { ...filter, ...(pageParam ? { cursor: pageParam } : {}), limit: PAGE },
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useProfile(name: string) {
  const [scope, enabled] = useScope();
  return useQuery({ queryKey: ["profile", scope, name], enabled: enabled && name !== "", queryFn: () => request("GET", `/profiles/${encodeURIComponent(name)}`, { schema: Profile }) });
}

export function useProfilePosts(name: string) {
  const [scope, enabled] = useScope();
  return useInfiniteQuery({
    queryKey: ["posts", scope, "profile", name],
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      request("GET", `/profiles/${encodeURIComponent(name)}/posts`, { schema: PostListResponse, query: { ...(pageParam ? { cursor: pageParam } : {}), limit: PAGE } }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function usePeopleSearch(q: string) {
  const [scope, enabled] = useScope();
  return useQuery({
    queryKey: ["people", scope, q],
    enabled: enabled && q.trim().length > 0,
    queryFn: async () => (await request("GET", "/profiles/search", { schema: PeopleResponse, query: { q: q.trim() } })).people,
  });
}

export function useNotifications() {
  const [scope, enabled] = useScope();
  return useQuery({
    queryKey: ["notifications", scope],
    enabled,
    queryFn: () => request("GET", "/notifications", { schema: NotificationListResponse, query: { limit: 50 } }),
    refetchInterval: 60_000,
  });
}

export function useFeedbackPrompts() {
  const [scope, enabled] = useScope();
  return useQuery({
    queryKey: ["prompts", scope],
    enabled,
    queryFn: async () => (await request("GET", "/feedback/prompts", { schema: FeedbackPromptsResponse })).prompts,
  });
}

export function useProgress() {
  const [scope, enabled] = useScope();
  return useQuery({ queryKey: ["progress", scope], enabled, queryFn: () => request("GET", "/dashboard/progress", { schema: DashboardProgress }) });
}

export function useDashboardFeedback(query: Pick<DashboardFeedbackQuery, "tab" | "verdict" | "itemId">) {
  const [scope, enabled] = useScope();
  return useInfiniteQuery({
    queryKey: ["feedback", scope, query],
    enabled,
    initialPageParam: undefined as string | undefined,
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam }) =>
      request("GET", "/dashboard/feedback", {
        schema: DashboardFeedbackResponse,
        query: { ...query, ...(pageParam ? { cursor: pageParam } : {}), limit: PAGE },
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useSaverCount(id: string, enabled: boolean) {
  const [scope, on] = useScope();
  return useQuery({ queryKey: ["savers", scope, id], enabled: on && enabled, queryFn: async () => (await request("GET", `/posts/${id}/savers`, { schema: SaverCountResponse })).count });
}

/** Writes the fresh post into the cache, then refreshes everything that lists posts, feedback or progress. */
function afterPostChange(qc: QueryClient, post?: PostDetail): void {
  const { activeId, actAs } = useAccounts.getState();
  const scope = `${activeId ?? ""}:${actAs?.id ?? ""}`;
  if (post) qc.setQueryData(["post", scope, post.id], post);
  void qc.invalidateQueries({ predicate: (q) => ["posts", "prompts", "progress", "feedback", "profile", "notifications", "follows"].includes(String(q.queryKey[0])) });
}

export function usePostActions(id: string) {
  const qc = useQueryClient();
  const done = (post: PostDetail) => {
    afterPostChange(qc, post);
  };
  const like = useMutation({
    mutationFn: (on: boolean) => request(on ? "PUT" : "DELETE", `/posts/${id}/like`, { schema: PostDetail }),
    onSuccess: done,
  });
  const save = useMutation({
    mutationFn: async (on: boolean) => {
      if (on) return request("PUT", `/posts/${id}/save`, { schema: PostDetail });
      await request("DELETE", `/posts/${id}/save`, { schema: NoContent });
      return request("GET", `/posts/${id}`, { schema: PostDetail });
    },
    onSuccess: done,
  });
  const updateSave = useMutation({
    mutationFn: (body: UpdateSaveBody) => request("PATCH", `/posts/${id}/save`, { body, schema: PostDetail }),
    onSuccess: done,
  });
  const feedback = useMutation({
    mutationFn: (body: SetFeedbackBody) => request("PUT", `/posts/${id}/feedback`, { body, schema: PostDetail }),
    onSuccess: done,
  });
  const clearFeedback = useMutation({
    mutationFn: () => request("DELETE", `/posts/${id}/feedback`, { schema: PostDetail }),
    onSuccess: done,
  });
  const tried = useMutation({
    mutationFn: (on: boolean) => request(on ? "PUT" : "DELETE", `/posts/${id}/tried`, { schema: PostDetail }),
    onSuccess: done,
  });
  const snooze = useMutation({
    mutationFn: () => request("POST", `/posts/${id}/feedback/snooze`, { schema: NoContent }),
    onSuccess: () => {
      afterPostChange(qc);
    },
  });
  return { like, save, updateSave, feedback, clearFeedback, tried, snooze };
}

export function useFollow(name: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (on: boolean) => request(on ? "PUT" : "DELETE", `/profiles/${encodeURIComponent(name)}/follow`, { schema: Profile }),
    onSuccess: () => {
      afterPostChange(qc);
    },
  });
}

export function useBlock(name: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (on: boolean) => request(on ? "PUT" : "DELETE", `/profiles/${encodeURIComponent(name)}/block`, { schema: NoContent }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useReport() {
  return useMutation({
    mutationFn: (body: { target: "item" | "user"; targetId: string; reason: string }) => request("POST", "/reports", { body, schema: NoContent }),
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => request("POST", "/notifications/read", { body: ids ? { ids } : {}, schema: NoContent }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useUpdateBio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bio: string | null) => request("PUT", "/profiles/me", { body: { bio }, schema: NoContent }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });
}

// ── sign-in methods ─────────────────────────────────────────────────────

export function useIdentities() {
  const [scope, enabled] = useScope();
  return useQuery({ queryKey: ["identities", scope], enabled, queryFn: () => request("GET", "/me/identities", { schema: IdentitiesResponse }) });
}

/** The page to open in the browser to link a provider to the signed-in account. */
export async function fetchLinkUrl(provider: OAuthProvider): Promise<string> {
  return (await request("POST", `/me/identities/${provider}/link`, { schema: OAuthStartResponse })).url;
}

export function useUnlinkIdentity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: OAuthProvider) => request("DELETE", `/me/identities/${provider}`, { schema: NoContent }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["identities"] }),
  });
}

// ── moderation (admin) ──────────────────────────────────────────────────

export function useReports(status: "open" | "actioned" | "dismissed", enabled: boolean) {
  const [scope, on] = useScope();
  return useQuery({
    queryKey: ["reports", scope, status],
    enabled: on && enabled,
    queryFn: async () => (await request("GET", "/moderation/reports", { schema: ReportListResponse, query: { status, limit: 50 } })).reports,
  });
}

export function useResolveReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string } & ResolveReportBody) => request("POST", `/moderation/reports/${args.id}`, { body: { action: args.action }, schema: NoContent }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports"] }),
  });
}

export function useCreateInvite() {
  return useMutation({ mutationFn: () => request("POST", "/invites", { schema: InviteResponse }) });
}

// ── blocked people, leaving ─────────────────────────────────────────────

export function useBlocked() {
  const [scope, enabled] = useScope();
  return useQuery({
    queryKey: ["blocked", scope],
    enabled,
    queryFn: async () => (await request("GET", "/profiles/blocked", { schema: BlockedResponse })).people,
  });
}

export function useUnblock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => request("DELETE", `/profiles/${encodeURIComponent(name)}/block`, { schema: NoContent }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

/** Deletes the signed-in account and everything in it; `confirm` is the username. */
export function useDeleteMyAccount() {
  return useMutation({ mutationFn: (confirm: string) => request("DELETE", "/me", { body: { confirm }, schema: NoContent }) });
}

// ── followers and following ─────────────────────────────────────────────

export type FollowKind = "followers" | "following";

export function useFollows(name: string, kind: FollowKind) {
  const [scope, enabled] = useScope();
  return useQuery({
    queryKey: ["follows", scope, name, kind],
    enabled: enabled && name !== "",
    queryFn: async () => (await request("GET", `/profiles/${encodeURIComponent(name)}/${kind}`, { schema: PeopleResponse })).people,
  });
}