import { createDb } from "@magpie/db";
import { createBlobStore } from "@magpie/storage";
import { PgBoss } from "pg-boss";
import { env } from "./env.ts";
import { auditPrune } from "./jobs/audit-prune.ts";
import { blobDelete } from "./jobs/blob-delete.ts";
import { createLogger } from "./logger.ts";
import { queues } from "./queues.ts";
import { toolVersions } from "./tools.ts";
import { APP_VERSION } from "./version.ts";

const log = createLogger(env.LOG_LEVEL);
log.info({ version: APP_VERSION, tools: await toolVersions() }, "worker starting");

const database = createDb(env.DATABASE_URL, { max: 3 });
const store = createBlobStore(env);

// pg-boss keeps its tables in its own `pgboss` schema in the same database
const boss = new PgBoss({ connectionString: env.DATABASE_URL, max: 3 });
boss.on("error", (error) => {
  log.error({ err: error }, "pg-boss error");
});
await boss.start();

for (const queue of Object.values(queues)) {
  await boss.createQueue(queue.name, queue.options);
}

await boss.work(queues.blobDelete.name, async (jobs) => {
  for (const job of jobs) await blobDelete(store, job.data);
});

await boss.work(queues.auditPrune.name, async () => {
  const deleted = await auditPrune(database.db);
  log.info({ deleted }, "audit log pruned");
});
await boss.schedule(queues.auditPrune.name, "17 4 * * *");

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
