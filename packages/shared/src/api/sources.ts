import { z } from "zod";

export const SourceInfo = z.object({
  id: z.string(),
  label: z.string(),
  hosts: z.array(z.string()),
  itemCount: z.number().int().nonnegative(),
});
export type SourceInfo = z.infer<typeof SourceInfo>;

export const SourcesResponse = z.object({ sources: z.array(SourceInfo) });
export type SourcesResponse = z.infer<typeof SourcesResponse>;
