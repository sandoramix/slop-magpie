import type { StrategyId, StrategyOptions } from "../strategies/types.ts";
import type { Runner } from "../tools/run.ts";

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface SourceLoginContext {
  run: Runner;
  /** Empty directory; deleted after the login. */
  tmpDir: string;
  credentials: LoginCredentials;
}

/** How to fetch one source (docs/sources.md). `id` matches the SourceDef in packages/shared. */
export interface SourceFetcher {
  id: string;
  /** Tried in order; the first that yields media wins. */
  strategies: readonly StrategyId[] | ((url: string) => readonly StrategyId[]);
  options?: Partial<StrategyOptions>;
  /** Logs in with the configured credentials and writes the session cookies (Netscape format) to `cookiesFile`. Throws on failure. */
  login?(ctx: SourceLoginContext, cookiesFile: string): Promise<void>;
}
