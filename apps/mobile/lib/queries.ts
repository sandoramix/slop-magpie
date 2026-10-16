import {
  BulkResponse,
  CreateItemResponse,
  Folder,
  FieldsResponse,
  FoldersResponse,
  ItemDetail,
  ItemListResponse,
  SmartFolder,
  SmartFoldersResponse,
  StatsResponse,
  Tag,
  TagsResponse,
  listParamsFromFilter,
  type BulkOp,
  type CreateFolderBody,
  type CreateSmartFolderBody,
  type CreateTagBody,
  type ItemFilter,
  type ItemSort,
  type SuggestionsBody,
  type UpdateFolderBody,
  type UpdateItemBody,
  type UpdateTagBody,
} from "@magpie/shared/api";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
import { request } from "./api";
import { useAuth } from "@/stores/auth";
import { useSettings } from "@/stores/settings";

const NoContent = z.null();
const PAGE_SIZE = 40;
const POLL_MS = 4000;

/** Queries are keyed by server + token presence so switching servers never shows stale data. */
function useScope(): readonly [string, boolean] {
  const apiUrl = useSettings((s) => s.apiUrl);
  const token = useAuth((s) => s.token);
  return [apiUrl, Boolean(apiUrl && token)] as const;
}

export type ItemsQuery = {
  filter: ItemFilter;
  smartFolderId?: string;
  sort?: ItemSort;
};

export function useItems(query: ItemsQuery) {
  const [apiUrl, enabled] = useScope();
  return useInfiniteQuery({
    queryKey: ["items", apiUrl, query],
    enabled,
    initialPageParam: undefined as string | undefined,
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam }) =>
      request("GET", "/items", {
        schema: ItemListResponse,
        query: {
          ...listParamsFromFilter(query.filter),
          ...(query.smartFolderId ? { smartFolderId: query.smartFolderId } : {}),
          ...(query.sort ? { sort: query.sort } : {}),
          ...(pageParam ? { cursor: pageParam } : {}),
          limit: PAGE_SIZE,
        },
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // freshly saved items turn ready in the background; keep the grid moving until they do
    refetchInterval: (q) =>
      q.state.data?.pages.some((p) => p.items.some((i) => i.fetchStatus === "pending" || i.fetchStatus === "fetching"))
        ? POLL_MS
        : false,
  });
}

export function useItem(id: string) {
  const [apiUrl, enabled] = useScope();
  return useQuery({
    queryKey: ["item", apiUrl, id],
    enabled,
    queryFn: () => request("GET", `/items/${id}`, { schema: ItemDetail }),
    refetchInterval: (q) =>
      q.state.data && (q.state.data.fetchStatus === "pending" || q.state.data.fetchStatus === "fetching")
        ? POLL_MS
        : false,
  });
}

export function useFolders() {
  const [apiUrl, enabled] = useScope();
  return useQuery({
    queryKey: ["folders", apiUrl],
    enabled,
    queryFn: async () => (await request("GET", "/folders", { schema: FoldersResponse })).folders,
  });
}

export function useTags() {
  const [apiUrl, enabled] = useScope();
  return useQuery({
    queryKey: ["tags", apiUrl],
    enabled,
    queryFn: async () => (await request("GET", "/tags", { schema: TagsResponse })).tags,
  });
}

export function useSmartFolders() {
  const [apiUrl, enabled] = useScope();
  return useQuery({
    queryKey: ["smart-folders", apiUrl],
    enabled,
    queryFn: async () => (await request("GET", "/smart-folders", { schema: SmartFoldersResponse })).smartFolders,
  });
}

export function useFields() {
  const [apiUrl, enabled] = useScope();
  return useQuery({
    queryKey: ["fields", apiUrl],
    enabled,
    queryFn: async () => (await request("GET", "/fields", { schema: FieldsResponse })).fields,
  });
}

export function useStats() {
  const [apiUrl, enabled] = useScope();
  return useQuery({
    queryKey: ["stats", apiUrl],
    enabled,
    queryFn: () => request("GET", "/stats", { schema: StatsResponse }),
    refetchInterval: 30_000,
  });
}

function invalidateLists(qc: QueryClient): Promise<void> {
  return qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "item" });
}

function setItem(qc: QueryClient, item: ItemDetail): void {
  qc.setQueryData(["item", useSettings.getState().apiUrl, item.id], item);
  void invalidateLists(qc);
}

export function useSaveLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { url: string; folderIds?: string[]; tagIds?: string[]; notes?: string }) =>
      request("POST", "/items", { body, schema: CreateItemResponse }),
    onSuccess: ({ item }) => {
      setItem(qc, item);
    },
  });
}

export function useUpdateItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateItemBody) => request("PATCH", `/items/${id}`, { body, schema: ItemDetail }),
    onSuccess: (item) => {
      setItem(qc, item);
    },
  });
}

export function useSetItemFolders(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (folderIds: string[]) =>
      request("PUT", `/items/${id}/folders`, { body: { folderIds }, schema: ItemDetail }),
    onSuccess: (item) => {
      setItem(qc, item);
    },
  });
}

export function useSetItemTags(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tagIds: string[]) => request("PUT", `/items/${id}/tags`, { body: { tagIds }, schema: ItemDetail }),
    onSuccess: (item) => {
      setItem(qc, item);
    },
  });
}

export function useSuggestionsAction(id: string, action: "accept" | "dismiss") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SuggestionsBody) =>
      request("POST", `/items/${id}/suggestions/${action}`, { body, schema: ItemDetail }),
    onSuccess: (item) => {
      setItem(qc, item);
    },
  });
}

export function useRefetchItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => request("POST", `/items/${id}/refetch`, { schema: ItemDetail }),
    onSuccess: (item) => {
      setItem(qc, item);
    },
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request("DELETE", `/items/${id}`, { schema: NoContent }),
    onSuccess: () => invalidateLists(qc),
  });
}

export function useBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { ids: string[]; op: BulkOp }) =>
      request("POST", "/items/bulk", { body: { ids: args.ids, ...args.op }, schema: BulkResponse }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useCreateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateFolderBody) => request("POST", "/folders", { body, schema: Folder }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["folders"] }),
  });
}

export function useUpdateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateFolderBody & { id: string }) =>
      request("PATCH", `/folders/${id}`, { body, schema: Folder }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["folders"] }),
  });
}

export function useDeleteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request("DELETE", `/folders/${id}`, { schema: NoContent }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTagBody) => request("POST", "/tags", { body, schema: Tag }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tags"] }),
  });
}

export function useUpdateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateTagBody & { id: string }) =>
      request("PATCH", `/tags/${id}`, { body, schema: Tag }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tags"] }),
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request("DELETE", `/tags/${id}`, { schema: NoContent }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useCreateSmartFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSmartFolderBody) => request("POST", "/smart-folders", { body, schema: SmartFolder }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["smart-folders"] }),
  });
}

export function useDeleteSmartFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request("DELETE", `/smart-folders/${id}`, { schema: NoContent }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["smart-folders"] }),
  });
}
