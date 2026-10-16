import { itemKeys, type BlobStore } from "@magpie/storage";
import { ItemJobData } from "../queues.ts";

/** Removes every blob of a deleted item. Idempotent. */
export async function blobDelete(store: BlobStore, data: unknown): Promise<void> {
  const { itemId } = ItemJobData.parse(data);
  await store.deletePrefix(itemKeys.prefix(itemId));
}
