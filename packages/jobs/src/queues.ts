// Queue contract shared by the API (sender) and the worker (consumer). See docs/worker-pipeline.md.
import type { Queue } from "pg-boss";
import { z } from "zod";

// Retries for network-bound steps: 1 min, then backoff capped at 1 h.
const networkRetry = { retryLimit: 3, retryDelay: 60, retryBackoff: true, retryDelayMax: 3600 } as const;

export const queues = {
  // stately + singletonKey = itemId: at most one queued and one running fetch per item
  fetch: { name: "fetch", options: { ...networkRetry, policy: "stately", expireInSeconds: 15 * 60 } },
  thumbnail: { name: "thumbnail", options: { retryLimit: 3, retryDelay: 60, retryBackoff: true, expireInSeconds: 10 * 60 } },
  extract: { name: "extract", options: { retryLimit: 3, retryDelay: 60 } },
  categorize: { name: "categorize", options: { retryLimit: 3, retryDelay: 60 } },
  blobDelete: { name: "blob-delete", options: { retryLimit: 5, retryDelay: 300, retryBackoff: true } },
  auditPrune: { name: "audit-prune", options: { retryLimit: 1 } },
  sourceCheck: { name: "source-check", options: { retryLimit: 1, expireInSeconds: 60 * 60 } },
  sweep: { name: "sweep", options: { retryLimit: 0 } },
  sessionCheck: { name: "session-check", options: { retryLimit: 0, expireInSeconds: 30 * 60 } },
  toolUpdate: { name: "tool-update", options: { retryLimit: 1, expireInSeconds: 30 * 60 } },
} as const satisfies Record<string, { name: string; options: Omit<Queue, "name"> }>;

export type QueueKey = keyof typeof queues;
export type QueueName = (typeof queues)[QueueKey]["name"];

/** Payload of every per-item job. Parsed with zod: job data is a JSON column. */
export const ItemJobData = z.object({ itemId: z.uuid() });
export type ItemJobData = z.infer<typeof ItemJobData>;
