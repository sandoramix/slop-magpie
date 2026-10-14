import { databaseEnv, loggingEnv, storageEnv } from "@magpie/shared/env";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    ...databaseEnv,
    ...loggingEnv,
    ...storageEnv,
    COOKIES_DIR: z.string().min(1),
    WORKER_TMP_DIR: z.string().min(1),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
    MAX_VIDEO_MB: z.coerce.number().positive().default(60),
    // hard cap per downloaded file
    MAX_DOWNLOAD_MB: z.coerce.number().positive().default(500),
    AUTO_ASSIGN_THRESHOLD: z.coerce.number().min(0).max(1).default(0.8),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

export type Env = typeof env;
