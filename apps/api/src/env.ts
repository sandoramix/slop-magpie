import { databaseEnv, loggingEnv, storageEnv } from "@magpie/shared/env";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    ...databaseEnv,
    ...loggingEnv,
    ...storageEnv,
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    API_TOKEN: z.string().min(32, "use `openssl rand -base64 48`"),
    CORS_ORIGINS: z
      .string()
      .default("")
      .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean)),
    MEDIA_URL_TTL_SECONDS: z.coerce.number().int().min(60).default(3600),
    // behind Coolify's proxy the client IP comes from X-Forwarded-For
    TRUST_PROXY: z.stringbool().default(false),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

export type Env = typeof env;
