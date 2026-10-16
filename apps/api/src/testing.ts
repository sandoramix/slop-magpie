// Test helpers: deps with fakes for everything external.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDb } from "@magpie/db";
import { createTestDatabase } from "@magpie/db/testing";
import type { ItemJobData, JobSender, QueueKey } from "@magpie/jobs";
import { createLocalBlobStore } from "@magpie/storage";
import { pino } from "pino";
import { createApp } from "./app.ts";
import { createAccountLookup } from "./services/users.ts";
import type { AppDeps, AuditEvent } from "./deps.ts";

export const TOKEN = "t".repeat(48);
export const SIGNING_SECRET = "s".repeat(48);
export const auth = { Authorization: `Bearer ${TOKEN}` };

export interface FakeJobs extends JobSender {
  sent: { queue: QueueKey; data: ItemJobData }[];
}

export function fakeJobs(): FakeJobs {
  const sent: FakeJobs["sent"] = [];
  return {
    sent,
    sendItemJob(queue, data) {
      sent.push({ queue, data });
      return Promise.resolve();
    },
  };
}

/** Deps for tests that never reach the database (postgres.js connects lazily). */
export function unitDeps(overrides: Partial<AppDeps> = {}): { deps: AppDeps; audits: AuditEvent[] } {
  const audits: AuditEvent[] = [];
  const deps: AppDeps = {
    version: "1.2.3",
    apiToken: TOKEN,
    corsOrigins: [],
    trustProxy: true,
    log: pino({ level: "silent" }),
    checkDb: () => Promise.resolve(),
    audit: (e) => {
      audits.push(e);
      return Promise.resolve();
    },
    countItemsBySource: () => Promise.resolve(new Map([["instagram", 3]])),
    // no accounts exist unless a test brings a database
    accounts: { findByTokenHash: () => Promise.resolve(null), findById: () => Promise.resolve(null) },
    db: createDb("postgres://unused@127.0.0.1:1/unused").db,
    store: createLocalBlobStore({ root: tmpdir(), signingSecret: SIGNING_SECRET, publicBaseUrl: "https://m.test" }),
    jobs: fakeJobs(),
    mediaSigningSecret: SIGNING_SECRET,
    mediaUrlTtlSeconds: 3600,
    ...overrides,
  };
  return { deps, audits };
}

export interface IntegrationEnv {
  deps: AppDeps;
  jobs: FakeJobs;
  mediaRoot: string;
  request: (path: string, init?: RequestInit & { json?: unknown }) => Promise<Response>;
  close: () => Promise<void>;
}

/** Fresh migrated database + temp media dir. */
export async function integrationEnv(serverUrl: string): Promise<IntegrationEnv> {
  const testDb = await createTestDatabase(serverUrl);
  const database = createDb(testDb.url, { max: 3 });
  const mediaRoot = await mkdtemp(path.join(tmpdir(), "magpie-media-"));
  const jobs = fakeJobs();
  const { deps } = unitDeps({
    db: database.db,
    jobs,
    store: createLocalBlobStore({ root: mediaRoot, signingSecret: SIGNING_SECRET, publicBaseUrl: "https://m.test" }),
    accounts: createAccountLookup(database.db),
    countItemsBySource: () => Promise.resolve(new Map()),
    audit: () => Promise.resolve(),
    log: pino({ level: "error" }),
  });
  const { app } = createApp(deps);
  return {
    deps,
    jobs,
    mediaRoot,
    request: (p, init = {}) => {
      const { json, headers, ...rest } = init;
      return Promise.resolve(
        app.request(`/api/v1${p}`, {
          ...rest,
          headers: { ...auth, ...(json === undefined ? {} : { "Content-Type": "application/json" }), ...(headers as Record<string, string> | undefined) },
          ...(json === undefined ? {} : { body: JSON.stringify(json) }),
        }),
      );
    },
    close: async () => {
      await database.close();
      await testDb.drop();
      await rm(mediaRoot, { recursive: true, force: true });
    },
  };
}
