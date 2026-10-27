import { AutoFiledResponse, HiddenItemsResponse, StopTermsResponse, SuspendedAccountsResponse, TopicsResponse, type AutoFiledActionBody } from "@magpie/shared/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { request } from "./api";
import { useScope } from "./queries";

const Affected = z.object({ affected: z.number() });
const NoContent = z.null();

// ── stop terms ──────────────────────────────────────────────────────────

export function useStopTerms() {
  const [scope, enabled] = useScope();
  return useQuery({ queryKey: ["stop-terms", scope], enabled, queryFn: async () => (await request("GET", "/stop-terms", { schema: StopTermsResponse })).terms });
}

export function useAddStopTerm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (term: string) => request("POST", "/stop-terms", { body: { term }, schema: StopTermsResponse }),
    // the server also dropped the matching keywords from every item
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useRemoveStopTerm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (term: string) => request("DELETE", `/stop-terms/${encodeURIComponent(term)}`, { schema: StopTermsResponse }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stop-terms"] }),
  });
}

// ── topics ──────────────────────────────────────────────────────────────

export function useTopics(unfiledOnly: boolean) {
  const [scope, enabled] = useScope();
  return useQuery({
    queryKey: ["topics", scope, unfiledOnly],
    enabled,
    queryFn: () => request("GET", "/topics", { schema: TopicsResponse, query: unfiledOnly ? { unfiled: true } : {} }),
  });
}

// ── automatic filing, reviewed ──────────────────────────────────────────

export function useAutoFiled() {
  const [scope, enabled] = useScope();
  return useQuery({
    queryKey: ["auto-filed", scope],
    enabled,
    queryFn: () => request("GET", "/auto-filed", { schema: AutoFiledResponse }),
    refetchInterval: 60_000,
  });
}

function useAutoFiledAction(action: "keep" | "undo") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AutoFiledActionBody) => request("POST", `/auto-filed/${action}`, { body, schema: Affected }),
    // folders, tags and counts everywhere may have changed
    onSuccess: () => qc.invalidateQueries(),
  });
}
export const useKeepAutoFiled = () => useAutoFiledAction("keep");
export const useUndoAutoFiled = () => useAutoFiledAction("undo");

// ── moderation: restore ─────────────────────────────────────────────────

export function useHiddenItems(enabled: boolean) {
  const [scope, on] = useScope();
  return useQuery({
    queryKey: ["hidden", scope],
    enabled: on && enabled,
    queryFn: async () => (await request("GET", "/moderation/hidden", { schema: HiddenItemsResponse })).items,
  });
}

export function useSuspendedAccounts(enabled: boolean) {
  const [scope, on] = useScope();
  return useQuery({
    queryKey: ["suspended", scope],
    enabled: on && enabled,
    queryFn: async () => (await request("GET", "/moderation/suspended", { schema: SuspendedAccountsResponse })).accounts,
  });
}

export function useRestore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { kind: "item" | "user"; id: string }) =>
      request("POST", args.kind === "item" ? `/moderation/items/${args.id}/unhide` : `/moderation/users/${args.id}/unsuspend`, { schema: NoContent }),
    onSuccess: () => qc.invalidateQueries(),
  });
}
