import type { Database } from "@magpie/db";
import type { JobSender } from "@magpie/jobs";
import type { BlobStore } from "@magpie/storage";
import type { Logger } from "./logger.ts";

export interface AuditEvent {
  action: string;
  ip: string | null;
  userAgent: string | null;
  /** Never secrets, tokens, cookies or signed URLs. */
  details?: Record<string, unknown>;
}

export interface AccountRef {
  id: string;
  name: string;
  displayName: string | null;
}

/** An account as the auth layer knows it. */
export interface Authenticated extends AccountRef {
  isAdmin: boolean;
  hasPassword: boolean;
  /** Set when the presented token was a password-login session rather than the generated token. */
  sessionId?: string;
}

export interface AccountLookup {
  /** Matches the generated account token or a live session token. */
  findByTokenHash: (tokenHash: string) => Promise<Authenticated | null>;
  findById: (id: string) => Promise<Authenticated | null>;
  /** True when the hash belonged to an account that has since been deleted. */
  isDeletedToken: (tokenHash: string) => Promise<boolean>;
}

/** Who a request is for, resolved by the auth middleware (docs/security.md). */
export interface Principal {
  /** The account the token belongs to. */
  id: string;
  name: string;
  displayName: string | null;
  isAdmin: boolean;
  hasPassword: boolean;
  /** Hash of the presented token when it is a session (so it can be revoked), else null. */
  sessionTokenHash: string | null;
  /** Set when an admin works inside another account's library. */
  actingAs: AccountRef | null;
  /** Owner of the library this request reads and writes. */
  libraryId: string;
}

export interface AppEnv {
  Variables: { principal: Principal };
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
  /** Item counts per source, for one account's library. */
  countItemsBySource: (userId: string) => Promise<ReadonlyMap<string, number>>;
  /** Account lookups for authentication; faked in unit tests. */
  accounts: AccountLookup;
  db: Database;
  store: BlobStore;
  jobs: JobSender;
  mediaSigningSecret: string;
  mediaUrlTtlSeconds: number;
  /** `POST /items` per minute. */
  createItemLimit?: number;
  /** Serve the admin page at `/admin` (default true). */
  adminWebUi?: boolean;
}

/** Subset handed to services. */
export type ServiceDeps = Pick<AppDeps, "db" | "store" | "jobs" | "log" | "mediaUrlTtlSeconds"> & {
  /** Owner of the library being read or written; every query is scoped to it. */
  userId: string;
};
