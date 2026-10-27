import type { Database } from "@magpie/db";
import type { JobSender } from "@magpie/jobs";
import type { BlobStore } from "@magpie/storage";
import type { Embedder } from "./embeddings/types.ts";
import type { Logger } from "./logger.ts";
import type { Guard } from "./net/ssrf.ts";
import type { LoginCredentials } from "./sources/types.ts";
import type { StrategyId, Strategy } from "./strategies/types.ts";
import type { Runner } from "./tools/run.ts";

/** Everything jobs need; faked in tests. */
export interface WorkerContext {
  db: Database;
  store: BlobStore;
  jobs: JobSender;
  guard: Guard;
  run: Runner;
  log: Logger;
  strategies: Readonly<Record<StrategyId, Strategy>>;
  cookiesDir: string;
  /** Writable; holds sessions created by automatic logins (src/sessions.ts). */
  sessionsDir: string;
  /** Credentials per source id; a source with an entry and a `login` hook keeps its own session. */
  logins: Readonly<Record<string, LoginCredentials>>;
  tmpDir: string;
  maxVideoBytes: number;
  maxDownloadBytes: number;
  autoAssignThreshold: number;
  /** Source ids with their own handling (every source except DISABLED_SOURCES). */
  enabledSources: readonly string[];
  /** Strategies an operator switched off (DISABLED_STRATEGIES); skipped in every chain. */
  disabledStrategies: readonly StrategyId[];
  /** Makes the meaning vector stored with each item (topic clusters); null when `EMBEDDER=off`. */
  embedder: Embedder | null;
  /** Writes an audit entry; never throws. */
  audit: (action: string, details: Record<string, unknown>) => Promise<void>;
}
