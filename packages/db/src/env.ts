import { databaseEnv } from "@magpie/shared/env";
import { createEnv } from "@t3-oss/env-core";

export const env = createEnv({
  server: { ...databaseEnv },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
