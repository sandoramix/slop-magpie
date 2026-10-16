// Env var shapes shared between apps. Each app spreads the fragments it needs into
// `createEnv({ server: { ...databaseEnv, ... } })` in its own src/env.ts.
import { z } from "zod";

export const databaseEnv = {
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
};

export const loggingEnv = {
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  // pretty: one readable line per event; json: raw pino output for log shippers
  LOG_FORMAT: z.enum(["pretty", "json"]).default("pretty"),
};

export const storageEnv = {
  STORAGE_DRIVER: z.enum(["local"]).default("local"),
  STORAGE_LOCAL_ROOT: z.string().min(1),
  MEDIA_SIGNING_SECRET: z.string().min(32, "use `openssl rand -base64 48`"),
  PUBLIC_BASE_URL: z.url({ protocol: /^https?$/ }).transform((s) => s.replace(/\/+$/, "")),
};
