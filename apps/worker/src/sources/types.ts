import type { StrategyId, StrategyOptions } from "../strategies/types.ts";

/** How to fetch one source (docs/sources.md). `id` matches the SourceDef in packages/shared. */
export interface SourceFetcher {
  id: string;
  /** Tried in order; the first that yields media wins. */
  strategies: readonly StrategyId[] | ((url: string) => readonly StrategyId[]);
  options?: Partial<StrategyOptions>;
}
