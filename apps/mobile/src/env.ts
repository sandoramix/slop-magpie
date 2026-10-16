import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

// Expo inlines `process.env.EXPO_PUBLIC_*` only for literal property access, so each var is listed.
export const env = createEnv({
  clientPrefix: "EXPO_PUBLIC_",
  client: {
    EXPO_PUBLIC_DEFAULT_API_URL: z.url({ protocol: /^https?$/ }).optional(),
  },
  runtimeEnv: {
    EXPO_PUBLIC_DEFAULT_API_URL: process.env.EXPO_PUBLIC_DEFAULT_API_URL as string | undefined,
  },
  emptyStringAsUndefined: true,
});
