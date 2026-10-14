import { PgBoss } from "pg-boss";
import { queues, type ItemJobData, type QueueKey } from "./queues.ts";

/** What the API needs from the queue. Faked in tests. */
export interface JobSender {
  /** Enqueues a per-item job. Duplicate fetches for the same item are collapsed. */
  sendItemJob(queue: QueueKey, data: ItemJobData): Promise<void>;
}

export interface PgBossSender extends JobSender {
  stop(): Promise<void>;
}

export async function createPgBossSender(connectionString: string, onError: (error: Error) => void): Promise<PgBossSender> {
  // the API only sends: no supervision/maintenance (the worker does that), small pool
  const boss = new PgBoss({ connectionString, max: 2, supervise: false, schedule: false });
  boss.on("error", onError);
  await boss.start();
  await ensureQueues(boss);
  return {
    async sendItemJob(queue, data) {
      await boss.send(queues[queue].name, data, { singletonKey: data.itemId });
    },
    stop: () => boss.stop({ graceful: false }),
  };
}

/** Idempotent; both processes call it at start-up so either can come up first. */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  const existing = new Set((await boss.getQueues()).map((q) => q.name));
  for (const queue of Object.values(queues)) {
    if (!existing.has(queue.name)) await boss.createQueue(queue.name, queue.options);
  }
}
