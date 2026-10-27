// Env var shapes shared between apps. Each app spreads the fragments it needs into
// `createEnv({ server: { ...databaseEnv, ... } })` in its own src/env.ts.
import { z } from "zod";
import { DEFAULT_ENABLED_SOURCES, parseEnabledSources } from "../sources/index.ts";

export const databaseEnv = {
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
};

export const loggingEnv = {
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  // pretty: one readable line per event; json: raw pino output for log shippers
  LOG_FORMAT: z.enum(["pretty", "json"]).default("pretty"),
};

/**
 * Which sites get their own source (docs/sources.md#enabling-a-source). The code for all of them exists;
 * the others save as `generic`. api and worker must be given the same list.
 */
export const sourcesEnv = {
  ENABLED_SOURCES: z
    .string()
    .default(DEFAULT_ENABLED_SOURCES.join(","))
    .transform(parseEnabledSources),
};

export const storageEnv = {
  STORAGE_DRIVER: z.enum(["local"]).default("local"),
  STORAGE_LOCAL_ROOT: z.string().min(1),
  MEDIA_SIGNING_SECRET: z.string().min(32, "use `openssl rand -base64 48`"),
  PUBLIC_BASE_URL: z.url({ protocol: /^https?$/ }).transform((s) => s.replace(/\/+$/, "")),
};
