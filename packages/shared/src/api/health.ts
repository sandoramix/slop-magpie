import { z } from "zod";

export const HealthResponse = z.object({
  ok: z.boolean(),
  version: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
