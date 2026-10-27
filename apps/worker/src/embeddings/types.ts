/** Length of every embedding. Matches the small sentence models (all-MiniLM-L6-v2), so switching embedders keeps the shape. */
export const EMBEDDING_DIMENSIONS = 384;

export interface EmbeddingInput {
  /** Title and caption as written; model embedders read this. */
  text: string;
  /** Keywords with their weights; the hashing embedder reads this. */
  terms: readonly { term: string; weight: number }[];
}

export interface Embedder {
  id: string;
  /** A unit-length vector, or an empty array when the input says nothing. */
  embed(input: EmbeddingInput): Promise<number[]>;
}
