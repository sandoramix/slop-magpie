import { EMBEDDING_DIMENSIONS, type Embedder, type EmbeddingInput } from "./types.ts";

/** FNV-1a, 32 bit. */
export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Feature hashing: every term adds its weight at a hashed position with a hashed sign, then the vector is
 * normalized. No model and no download, so items sharing vocabulary end up close. A phrase also counts its
 * words at half weight, so "slow cooker" is near "cooker".
 */
export function hashEmbed(input: EmbeddingInput, dims = EMBEDDING_DIMENSIONS): number[] {
  const v = new Array<number>(dims).fill(0);
  const add = (term: string, weight: number) => {
    const slot = fnv1a(term) % dims;
    v[slot] = (v[slot] ?? 0) + (fnv1a(`${term}#`) % 2 === 0 ? weight : -weight);
  };
  for (const { term, weight } of input.terms) {
    add(term, weight);
    const words = term.split(" ");
    if (words.length > 1) for (const w of words) add(w, weight / 2);
  }
  const norm = Math.hypot(...v);
  return norm === 0 ? [] : v.map((x) => x / norm);
}

export const hashEmbedder: Embedder = {
  id: "hash",
  embed: (input) => Promise.resolve(hashEmbed(input)),
};
