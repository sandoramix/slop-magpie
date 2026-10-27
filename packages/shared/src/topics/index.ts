// Topic clusters from item embeddings. Pure, so the API can run it and the tests can pin it down.

export function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

export interface TopicInput {
  id: string;
  embedding: readonly number[];
  keywords: readonly string[];
}

export interface Topic {
  /** The words most of its items share. */
  label: string;
  keywords: string[];
  itemIds: string[];
}

export interface TopicOptions {
  /** Cosine similarity to a topic's centre needed to join it. */
  threshold?: number;
  /** Smaller groups are noise and are dropped. */
  minSize?: number;
  maxTopics?: number;
}

function centroid(vectors: readonly (readonly number[])[], dims: number): number[] {
  const sum = new Array<number>(dims).fill(0);
  for (const v of vectors) for (let i = 0; i < dims; i++) sum[i] = (sum[i] ?? 0) + (v[i] ?? 0);
  return sum.map((x) => x / Math.max(1, vectors.length));
}

function bestCluster(centres: readonly number[][], v: readonly number[]): { index: number; score: number } {
  let index = -1;
  let score = -1;
  for (const [i, c] of centres.entries()) {
    const s = cosine(c, v);
    if (s > score) {
      index = i;
      score = s;
    }
  }
  return { index, score };
}

/** Words that most members of the group carry; falls back to the single most common one. */
export function labelTopic(members: readonly TopicInput[]): string[] {
  const counts = new Map<string, number>();
  for (const m of members) for (const k of new Set(m.keywords)) counts.set(k, (counts.get(k) ?? 0) + 1);
  const ranked = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const common = ranked.filter(([, n]) => n >= Math.max(2, members.length * 0.3)).slice(0, 3);
  return (common.length ? common : ranked.slice(0, 1)).map(([k]) => k);
}

/**
 * Leader clustering with a refinement pass: items join the closest topic centre above the threshold or start
 * a new one, then every item is placed again against the final centres. Deterministic for a given input order.
 */
export function clusterTopics(inputs: readonly TopicInput[], options: TopicOptions = {}): Topic[] {
  const threshold = options.threshold ?? 0.5;
  const minSize = options.minSize ?? 3;
  const usable = inputs.filter((i) => i.embedding.length > 0);
  const first = usable[0];
  if (!first) return [];
  const dims = first.embedding.length;

  let groups: TopicInput[][] = [];
  const centres: number[][] = [];
  for (const item of usable) {
    const best = bestCluster(centres, item.embedding);
    if (best.index >= 0 && best.score >= threshold) {
      const group = groups[best.index];
      if (!group) continue;
      group.push(item);
      centres[best.index] = centroid(group.map((g) => g.embedding), dims);
    } else {
      groups.push([item]);
      centres.push([...item.embedding]);
    }
  }

  // second pass against the settled centres
  const reassigned: TopicInput[][] = centres.map(() => []);
  for (const item of usable) {
    const best = bestCluster(centres, item.embedding);
    reassigned[best.index]?.push(item);
  }
  groups = reassigned.filter((g) => g.length > 0);

  return groups
    .filter((g) => g.length >= minSize)
    .map((members) => {
      const keywords = labelTopic(members);
      return { label: keywords.join(" · ") || "Untitled topic", keywords, itemIds: members.map((m) => m.id) };
    })
    .sort((a, b) => b.itemIds.length - a.itemIds.length || a.label.localeCompare(b.label))
    .slice(0, options.maxTopics ?? 50);
}
