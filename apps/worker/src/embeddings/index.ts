import type { Logger } from "../logger.ts";
import { hashEmbedder } from "./hash.ts";
import { createTransformersEmbedder } from "./transformers.ts";
import type { Embedder } from "./types.ts";

export type EmbedderKind = "off" | "hash" | "transformers";

/** The configured embedder, or null for `off`. A model embedder that cannot start falls back to hashing. */
export async function createEmbedder(kind: EmbedderKind, log: Logger): Promise<Embedder | null> {
  if (kind === "off") return null;
  if (kind === "transformers") {
    try {
      return await createTransformersEmbedder();
    } catch (error) {
      log.warn({ err: error }, "EMBEDDER=transformers could not start (is @huggingface/transformers installed?); using the hashing embedder");
    }
  }
  return hashEmbedder;
}

export * from "./types.ts";
