import { z } from "zod";
import { FetchStatus, Workflow } from "./enums.ts";

/** `GET /stats`: counters for the app's home/inbox badges. */
export const StatsResponse = z.object({
  total: z.number().int().nonnegative(),
  favorites: z.number().int().nonnegative(),
  gone: z.number().int().nonnegative(),
  withSuggestions: z.number().int().nonnegative(),
  byWorkflow: z.record(Workflow, z.number().int().nonnegative()),
  byFetchStatus: z.record(FetchStatus, z.number().int().nonnegative()),
});
export type StatsResponse = z.infer<typeof StatsResponse>;
