import path from "node:path";
import { databaseEnv, loggingEnv, storageEnv } from "@magpie/shared/env";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    ...databaseEnv,
    ...loggingEnv,
    ...storageEnv,
    COOKIES_DIR: z.string().min(1),
    SESSIONS_DIR: z.string().min(1).default("./secrets/sessions"),
    // optional: log in automatically and renew the session instead of uploading instagram.txt
    INSTAGRAM_USERNAME: z.string().min(1).optional(),
    INSTAGRAM_PASSWORD: z.string().min(1).optional(),
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

/** Environment for the CLIs we spawn, with the updated tools dir (src/tools/update.ts) first on their search paths. */
export function toolEnv(toolsDir: string): NodeJS.ProcessEnv {
  const prepend = (dir: string, current: string | undefined) => [dir, current].filter(Boolean).join(path.delimiter);
  return {
    ...process.env,
    PYTHONPATH: prepend(toolsDir, process.env.PYTHONPATH),
    PATH: prepend(path.join(toolsDir, "bin"), process.env.PATH),
  };
}
