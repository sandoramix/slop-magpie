import { auditLog, createDb } from "@magpie/db";
import { ensureQueues, ItemJobData, queues, senderFromBoss } from "@magpie/jobs";
import { createBlobStore } from "@magpie/storage";
import { PgBoss } from "pg-boss";
import type { WorkerContext } from "./context.ts";
import { env, toolEnv } from "./env.ts";
import { auditPrune } from "./jobs/audit-prune.ts";
import { blobDelete } from "./jobs/blob-delete.ts";
import { categorizeItem } from "./jobs/categorize.ts";
import { extractItem } from "./jobs/extract.ts";
import { fetchItem } from "./jobs/fetch.ts";
import { recategorize } from "./jobs/recategorize.ts";
import { sessionCheck } from "./jobs/session-check.ts";
import { sourceCheck } from "./jobs/source-check.ts";
import { sweep } from "./jobs/sweep.ts";
import { thumbnailItem } from "./jobs/thumbnail.ts";
import { createLogger } from "./logger.ts";
import { createGuard } from "./net/ssrf.ts";
import { strategies } from "./strategies/index.ts";
import { runTool, setToolEnv } from "./tools/run.ts";
import { toolsDirFor, updateTools } from "./tools/update.ts";
import { toolVersions } from "./tools/versions.ts";
import { APP_VERSION } from "./version.ts";

const log = createLogger(env.LOG_LEVEL, env.LOG_FORMAT);
const toolsDir = toolsDirFor(env.SESSIONS_DIR);
setToolEnv(toolEnv(toolsDir));
log.info({ version: APP_VERSION, tools: await toolVersions(toolEnv(toolsDir)) }, "worker starting");

const database = createDb(env.DATABASE_URL, { max: 3 });
const { db } = database;

// pg-boss keeps its tables in its own `pgboss` schema in the same database
const boss = new PgBoss({ connectionString: env.DATABASE_URL, max: 3 });
boss.on("error", (error) => {
  log.error({ err: error }, "pg-boss error");
});
await boss.start();
await ensureQueues(boss);

const MB = 1024 * 1024;
const ctx: WorkerContext = {
  db,
  store: createBlobStore(env),
  jobs: senderFromBoss(boss),
  guard: createGuard(),
  run: runTool,
  log,
  strategies,
  cookiesDir: env.COOKIES_DIR,
  sessionsDir: env.SESSIONS_DIR,
  logins:
    env.INSTAGRAM_USERNAME ? { instagram: { username: env.INSTAGRAM_USERNAME, password: env.INSTAGRAM_PASSWORD ?? null } } : {},
  tmpDir: env.WORKER_TMP_DIR,
  maxVideoBytes: env.MAX_VIDEO_MB * MB,
  maxDownloadBytes: env.MAX_DOWNLOAD_MB * MB,
  autoAssignThreshold: env.AUTO_ASSIGN_THRESHOLD,
  enabledSources: env.ENABLED_SOURCES,
  async audit(action, details) {
    try {
      await db.insert(auditLog).values({ action, ip: null, userAgent: null, details });
    } catch (error) {
      log.error({ err: error, action }, "audit write failed");
    }
  },
};

// heavy steps run with WORKER_CONCURRENCY (default 1) to protect the other services on the Pi
const heavy = { includeMetadata: true, batchSize: 1, localConcurrency: env.WORKER_CONCURRENCY } as const;
const light = { batchSize: 1, localConcurrency: 2 } as const;

await boss.work(queues.fetch.name, heavy, async ([job]) => {
  if (!job) return;
  const { itemId } = ItemJobData.parse(job.data);
  const outcome = await fetchItem(ctx, { itemId, lastAttempt: job.retryCount >= job.retryLimit, signal: job.signal });
  log.debug({ itemId, outcome }, "fetch job done");
});

await boss.work(queues.thumbnail.name, heavy, async ([job]) => {
  if (!job) return;
  await thumbnailItem(ctx, ItemJobData.parse(job.data).itemId);
});

await boss.work(queues.extract.name, light, async ([job]) => {
  if (!job) return;
  await extractItem(ctx, ItemJobData.parse(job.data).itemId);
});

await boss.work(queues.categorize.name, light, async ([job]) => {
  if (!job) return;
  const itemId = ItemJobData.parse(job.data).itemId;
  log.debug({ itemId, ...(await categorizeItem(ctx, itemId)) }, "categorized");
});

await boss.work(queues.blobDelete.name, async (jobs) => {
  for (const job of jobs) await blobDelete(ctx.store, job.data);
});

await boss.work(queues.auditPrune.name, async () => {
  log.info({ deleted: await auditPrune(db) }, "audit log pruned");
});

await boss.work(queues.sourceCheck.name, async () => {
  log.info(await sourceCheck(ctx), "source check done");
});

await boss.work(queues.sweep.name, async () => {
  const requeued = await sweep(ctx);
  if (requeued.fetch || requeued.thumbnail) log.info(requeued, "sweep re-enqueued work");
});

await boss.work(queues.recategorize.name, async () => {
  log.info({ queued: await recategorize(ctx) }, "recategorize done");
});

await boss.work(queues.sessionCheck.name, async () => {
  log.info(await sessionCheck(ctx), "session check done");
});

await boss.work(queues.toolUpdate.name, async () => {
  await updateTools(runTool, log, toolsDir);
  log.info({ tools: await toolVersions(toolEnv(toolsDir)) }, "tools after update");
});

await boss.schedule(queues.auditPrune.name, "17 4 * * *");
await boss.schedule(queues.recategorize.name, "37 3 * * *");
await boss.schedule(queues.sessionCheck.name, "41 */6 * * *");
await boss.schedule(queues.toolUpdate.name, "11 5 * * *");
// also once per start: a redeploy then picks up releases without waiting for the schedule
await boss.send(queues.toolUpdate.name, {}, { singletonKey: "boot", singletonSeconds: 3600 });
await boss.schedule(queues.sourceCheck.name, "23 3 * * 1");
await boss.schedule(queues.sweep.name, "*/15 * * * *");

log.info("worker ready");

let stopping = false;
const shutdown = async (signal: string) => {
  if (stopping) return;
  stopping = true;
  log.info({ signal }, "shutting down");
  setTimeout(() => process.exit(1), 60_000).unref();
  // graceful: let running jobs finish so temp files are cleaned up
  await boss.stop({ graceful: true, timeout: 50_000 });
  await database.close();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
