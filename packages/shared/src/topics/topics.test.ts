import { describe, expect, it } from "vitest";
import { clusterTopics, cosine, labelTopic } from "./index.ts";

const unit = (...v: number[]) => {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};

describe("cosine", () => {
  it("is 1 for equal directions, 0 for orthogonal ones and 0 for empty vectors", () => {
    expect(cosine([1, 0], [2, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 3])).toBeCloseTo(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe("clusterTopics", () => {
  const baking = (id: string, wobble: number) => ({ id, embedding: unit(1, wobble, 0), keywords: ["bread", "baking", id] });
  const travel = (id: string, wobble: number) => ({ id, embedding: unit(0, wobble, 1), keywords: ["trip", "baking" === id ? "x" : "travel"] });

  it("groups similar items, labels them by shared words and drops tiny groups", () => {
    const topics = clusterTopics([baking("a", 0.1), travel("t1", 0.1), baking("b", 0.2), travel("t2", 0.2), baking("c", 0.05), travel("t3", 0.1), travel("t4", 0), { id: "lonely", embedding: unit(1, 1, 1), keywords: [] }], {
      threshold: 0.8,
    });
    expect(topics).toHaveLength(2);
    const bread = topics.find((t) => t.itemIds.includes("a"));
    expect(bread?.itemIds.sort()).toEqual(["a", "b", "c"]);
    expect(bread?.keywords).toEqual(expect.arrayContaining(["bread", "baking"]));
    expect(topics.find((t) => t.itemIds.includes("t1"))?.itemIds).toHaveLength(4);
    // largest first
    expect(topics[0]?.itemIds.length).toBeGreaterThanOrEqual(topics[1]?.itemIds.length ?? 0);
  });

  it("is empty without embeddings and respects minSize", () => {
    expect(clusterTopics([])).toEqual([]);
    expect(clusterTopics([{ id: "a", embedding: [], keywords: ["x"] }])).toEqual([]);
    expect(clusterTopics([baking("a", 0), baking("b", 0)], { minSize: 3 })).toEqual([]);
    expect(clusterTopics([baking("a", 0), baking("b", 0)], { minSize: 2 })).toHaveLength(1);
  });

  it("labels with the words most members share, else the commonest one", () => {
    expect(labelTopic([{ id: "1", embedding: [1], keywords: ["a", "b"] }, { id: "2", embedding: [1], keywords: ["a", "c"] }, { id: "3", embedding: [1], keywords: ["a", "b"] }])).toEqual(["a", "b"]);
    expect(labelTopic([{ id: "1", embedding: [1], keywords: ["x"] }, { id: "2", embedding: [1], keywords: ["y"] }])).toEqual(["x"]);
    expect(labelTopic([{ id: "1", embedding: [1], keywords: [] }])).toEqual([]);
  });
});
