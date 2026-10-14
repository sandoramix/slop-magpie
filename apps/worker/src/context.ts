import type { Database } from "@magpie/db";
import type { JobSender } from "@magpie/jobs";
import type { BlobStore } from "@magpie/storage";
import type { Logger } from "./logger.ts";
import type { Guard } from "./net/ssrf.ts";
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
  tmpDir: string;
  maxVideoBytes: number;
  maxDownloadBytes: number;
  autoAssignThreshold: number;
  /** Writes an audit entry; never throws. */
  audit: (action: string, details: Record<string, unknown>) => Promise<void>;
}
