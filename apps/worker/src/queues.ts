import type { Queue } from "pg-boss";
import { z } from "zod";

// Retries for network-bound steps: 1 min, then backoff capped at 1 h (docs/worker-pipeline.md).
const networkRetry = { retryLimit: 3, retryDelay: 60, retryBackoff: true, retryDelayMax: 3600 } as const;

export const queues = {
  fetch: { name: "fetch", options: { ...networkRetry, expireInSeconds: 15 * 60 } },
  thumbnail: { name: "thumbnail", options: { retryLimit: 3, retryDelay: 60, retryBackoff: true } },
  extract: { name: "extract", options: { retryLimit: 3, retryDelay: 60 } },
  categorize: { name: "categorize", options: { retryLimit: 3, retryDelay: 60 } },
  blobDelete: { name: "blob-delete", options: { retryLimit: 5, retryDelay: 300, retryBackoff: true } },
  auditPrune: { name: "audit-prune", options: { retryLimit: 1 } },
} as const satisfies Record<string, { name: string; options: Omit<Queue, "name"> }>;

export type QueueName = (typeof queues)[keyof typeof queues]["name"];

/** Payload of every per-item job. Parsed with zod: job data is a JSON column. */
export const ItemJobData = z.object({ itemId: z.uuid() });
export type ItemJobData = z.infer<typeof ItemJobData>;
