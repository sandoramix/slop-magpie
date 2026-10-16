import { itemFolderSuggestions, items, itemTagSuggestions } from "@magpie/db";
import { fetchStatuses, type StatsResponse, workflows } from "@magpie/shared/api";
import { count, eq, sql } from "drizzle-orm";
import type { ServiceDeps } from "../deps.ts";

export async function getStats({ db }: Pick<ServiceDeps, "db">): Promise<StatsResponse> {
  const [totals, byWorkflow, byStatus] = await Promise.all([
    db
      .select({
        total: count(),
        favorites: sql<number>`count(*) filter (where ${items.favorite})::int`,
        gone: sql<number>`count(*) filter (where ${eq(items.availability, "gone")})::int`,
        withSuggestions: sql<number>`count(*) filter (where exists (select 1 from ${itemFolderSuggestions} s where s.item_id = ${items.id}) or exists (select 1 from ${itemTagSuggestions} s where s.item_id = ${items.id}))::int`,
      })
      .from(items),
    db.select({ key: items.workflow, n: count() }).from(items).groupBy(items.workflow),
    db.select({ key: items.fetchStatus, n: count() }).from(items).groupBy(items.fetchStatus),
  ]);
  const t = totals[0];
  return {
    total: t?.total ?? 0,
    favorites: t?.favorites ?? 0,
    gone: t?.gone ?? 0,
    withSuggestions: t?.withSuggestions ?? 0,
    byWorkflow: Object.fromEntries(workflows.map((w) => [w, byWorkflow.find((r) => r.key === w)?.n ?? 0])) as StatsResponse["byWorkflow"],
    byFetchStatus: Object.fromEntries(fetchStatuses.map((s) => [s, byStatus.find((r) => r.key === s)?.n ?? 0])) as StatsResponse["byFetchStatus"],
  };
}
