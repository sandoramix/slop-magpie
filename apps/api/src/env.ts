import { registrationModes } from "@magpie/shared/api";
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
    // the /admin page for replacing the Instagram login from a browser; the token is typed in, never stored
    ADMIN_WEB_UI: z.stringbool().default(true),
    // `invite`: signup needs a code from an admin. `open`: anyone can create an account (docs/social.md)
    REGISTRATION_MODE: z.enum(registrationModes).default("invite"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

export type Env = typeof env;
