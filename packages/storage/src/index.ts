import type { BlobStore } from "./blob-store.ts";
import { createLocalBlobStore } from "./drivers/local.ts";

export * from "./blob-store.ts";
export { createLocalBlobStore, type LocalBlobStoreOptions } from "./drivers/local.ts";
export { assertValidKey, contentTypeForKey, extensionForContentType, itemKeys } from "./keys.ts";
export { signMediaKey, verifyMediaSignature } from "./signer.ts";

export interface StorageConfig {
  STORAGE_DRIVER: "local";
  STORAGE_LOCAL_ROOT: string;
  MEDIA_SIGNING_SECRET: string;
  PUBLIC_BASE_URL: string;
}

/** Builds the configured driver from the validated env (see storageEnv in @magpie/shared/env). */
export function createBlobStore(config: StorageConfig): BlobStore {
  // `local` is the only driver so far; the s3 driver adds a branch on STORAGE_DRIVER here
  return createLocalBlobStore({
    root: config.STORAGE_LOCAL_ROOT,
    signingSecret: config.MEDIA_SIGNING_SECRET,
    publicBaseUrl: config.PUBLIC_BASE_URL,
  });
}
