// Env var shapes shared between apps. Each app spreads the fragments it needs into
// `createEnv({ server: { ...databaseEnv, ... } })` in its own src/env.ts.
import { z } from "zod";
import { parseSourceIds } from "../sources/index.ts";

export const databaseEnv = {
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
};

export const loggingEnv = {
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  // pretty: one readable line per event; json: raw pino output for log shippers
  LOG_FORMAT: z.enum(["pretty", "json"]).default("pretty"),
};

/**
 * Sites switched off (docs/sources.md#disabling-a-source). Every source is on by default; a listed one saves as
 * `generic` instead. api and worker must be given the same list. Unknown ids are ignored.
 */
export const sourcesEnv = {
  DISABLED_SOURCES: z.string().default("").transform(parseSourceIds),
};

export const storageEnv = {
  STORAGE_DRIVER: z.enum(["local"]).default("local"),
  STORAGE_LOCAL_ROOT: z.string().min(1),
  MEDIA_SIGNING_SECRET: z.string().min(32, "use `openssl rand -base64 48`"),
  PUBLIC_BASE_URL: z.url({ protocol: /^https?$/ }).transform((s) => s.replace(/\/+$/, "")),
};
