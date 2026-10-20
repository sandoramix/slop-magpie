import type { StrategyId, StrategyOptions } from "../strategies/types.ts";

export interface LoginCredentials {
  username: string;
  /** Absent when the session is imported by hand and the worker must never sign in itself. */
  password: string | null;
}

/** How to fetch one source (docs/sources.md). `id` matches the SourceDef in packages/shared. */
export interface SourceFetcher {
  id: string;
  /** Tried in order; the first that yields media wins. */
  strategies: readonly StrategyId[] | ((url: string) => readonly StrategyId[]);
  options?: Partial<StrategyOptions>;
}
