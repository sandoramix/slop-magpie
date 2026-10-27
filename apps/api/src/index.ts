import { serve } from "@hono/node-server";
import { auditLog, createDb, items, runMigrations } from "@magpie/db";
import { createPgBossSender } from "@magpie/jobs";
import { createBlobStore } from "@magpie/storage";
import { count, eq } from "drizzle-orm";
import { createApp } from "./app.ts";
import type { AppDeps } from "./deps.ts";
import { env } from "./env.ts";
import { createLogger } from "./logger.ts";
import { createAccountLookup } from "./services/users.ts";
import { APP_VERSION } from "./version.ts";

const log = createLogger(env.LOG_LEVEL, env.LOG_FORMAT);

await runMigrations(env.DATABASE_URL);
log.info("migrations applied");

const database = createDb(env.DATABASE_URL);
const { db } = database;
const jobs = await createPgBossSender(env.DATABASE_URL, (error) => {
  log.error({ err: error }, "pg-boss error");
});

const deps: AppDeps = {
  version: APP_VERSION,
  apiToken: env.API_TOKEN,
  corsOrigins: env.CORS_ORIGINS,
  trustProxy: env.TRUST_PROXY,
  adminWebUi: env.ADMIN_WEB_UI,
  registrationMode: env.REGISTRATION_MODE,
  enabledSources: env.ENABLED_SOURCES,
  log,
  checkDb: database.ping,
  async audit(event) {
    try {
      await db.insert(auditLog).values(event);
    } catch (error) {
      log.error({ err: error, action: event.action }, "audit write failed");
    }
  },
  accounts: createAccountLookup(db),
  async countItemsBySource(userId) {
    const rows = await db.select({ source: items.source, n: count() }).from(items).where(eq(items.userId, userId)).groupBy(items.source);
    return new Map(rows.map((r) => [r.source, r.n]));
  },
  db,
  store: createBlobStore(env),
  jobs,
  mediaSigningSecret: env.MEDIA_SIGNING_SECRET,
  mediaUrlTtlSeconds: env.MEDIA_URL_TTL_SECONDS,
};

const { app } = createApp(deps);
const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  log.info({ port: info.port, version: APP_VERSION }, "api listening");
});

let stopping = false;
const shutdown = (signal: string) => {
  if (stopping) return;
  stopping = true;
  log.info({ signal }, "shutting down");
  server.close(() => {
    void Promise.allSettled([jobs.stop(), database.close()]).finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  shutdown("SIGINT");
});
