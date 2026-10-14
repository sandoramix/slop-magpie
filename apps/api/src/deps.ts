import type { Logger } from "./logger.ts";

export interface AuditEvent {
  action: string;
  ip: string | null;
  userAgent: string | null;
  /** Never secrets, tokens, cookies or signed URLs. */
  details?: Record<string, unknown>;
}

/** Everything the HTTP layer needs from the outside world; faked in tests. */
export interface AppDeps {
  version: string;
  apiToken: string;
  corsOrigins: readonly string[];
  trustProxy: boolean;
  log: Logger;
  checkDb: () => Promise<void>;
  audit: (event: AuditEvent) => Promise<void>;
  countItemsBySource: () => Promise<ReadonlyMap<string, number>>;
}
