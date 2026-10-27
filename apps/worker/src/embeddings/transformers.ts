import { z } from "zod";
import { EMBEDDING_DIMENSIONS, type Embedder } from "./types.ts";

const MODEL = "Xenova/all-MiniLM-L6-v2";

const Output = z.object({ data: z.instanceof(Float32Array) });
const Extractor = z.custom<(text: string, options: { pooling: "mean"; normalize: boolean }) => Promise<unknown>>((v) => typeof v === "function");

/**
 * Sentence embeddings from a small model through transformers.js (onnxruntime has linux-arm64 builds).
 * The package is not a dependency: install `@huggingface/transformers` in apps/worker to use it, then set
 * `EMBEDDER=transformers`. The model (about 25 MB) is downloaded on first use and cached. Until then the
 * worker keeps using the hashing embedder, and says so in its log.
 */
export async function createTransformersEmbedder(): Promise<Embedder> {
  // a variable specifier keeps TypeScript and bundlers from requiring the package to be present
  const specifier = "@huggingface/transformers";
  const lib: unknown = await import(specifier);
  const pipeline = (lib as { pipeline?: (task: string, model: string) => Promise<unknown> }).pipeline;
  if (typeof pipeline !== "function") throw new Error("@huggingface/transformers does not export pipeline");
  const extractor = Extractor.parse(await pipeline("feature-extraction", MODEL));

  return {
    id: `transformers:${MODEL}`,
    async embed(input) {
      const text = input.text.trim();
      if (!text) return [];
      const out = Output.parse(await extractor(text.slice(0, 2000), { pooling: "mean", normalize: true }));
      const vector = Array.from(out.data);
      if (vector.length !== EMBEDDING_DIMENSIONS) throw new Error(`model returned ${vector.length} dimensions, expected ${EMBEDDING_DIMENSIONS}`);
      return vector;
    },
  };
}
