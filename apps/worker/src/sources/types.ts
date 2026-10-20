import type { StrategyId, StrategyOptions } from "../strategies/types.ts";

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface SourceLoginContext {
  fetch: typeof globalThis.fetch;
  credentials: LoginCredentials;
}

/** How to fetch one source (docs/sources.md). `id` matches the SourceDef in packages/shared. */
export interface SourceFetcher {
  id: string;
  /** Tried in order; the first that yields media wins. */
  strategies: readonly StrategyId[] | ((url: string) => readonly StrategyId[]);
  options?: Partial<StrategyOptions>;
  /** Logs in with the configured credentials and returns the session as cookies.txt (Netscape format). Throws on failure. */
  login?(ctx: SourceLoginContext): Promise<string>;
}
