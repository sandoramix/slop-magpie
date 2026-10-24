import { describe, expect, it } from "vitest";
import { combineScores, nameKey, scoreAuthor, scoreNameMatches } from "./categorize.ts";

describe("scoreNameMatches", () => {
  const targets = [
    { id: "t1", name: "Slow cooker" },
    { id: "t2", name: "Travel" },
    { id: "t3", name: "AI" },
  ];

  it("matches a hashtag to a tag name ignoring case and separators", () => {
    const scores = scoreNameMatches([{ keyword: "slow_cooker", weight: 1 }], targets);
    expect(scores.get("t1")).toBe(0.7);
  });

  it("weighs caption words less than hashtags", () => {
    const scores = scoreNameMatches([{ keyword: "travel", weight: 0.4 }], targets);
    expect(scores.get("t2")).toBe(0.28);
  });

  it("ignores names too short to be meaningful", () => {
    expect(scoreNameMatches([{ keyword: "ai", weight: 1 }], targets).size).toBe(0);
  });

  it("folds separators", () => {
    expect(nameKey("#Slow-Cooker_recipes")).toBe("slowcookerrecipes");
  });
});

describe("scoreAuthor", () => {
  it("is smoothed: one example gives 0.45", () => {
    expect(scoreAuthor(1, new Map([["f", 1]])).get("f")).toBe(0.45);
  });

  it("grows with consistent examples", () => {
    expect(scoreAuthor(8, new Map([["f", 8]])).get("f")).toBe(0.8);
  });

  it("splits between targets", () => {
    const scores = scoreAuthor(4, new Map([["a", 3], ["b", 1]]));
    expect(scores.get("a")).toBeGreaterThan(scores.get("b") ?? 1);
  });
});

describe("combineScores", () => {
  it("lets agreeing signals reinforce each other", () => {
    const out = combineScores(new Map([["x", 0.5]]), new Map([["x", 0.5], ["y", 0.3]]));
    expect(out.get("x")).toBe(0.75);
    expect(out.get("y")).toBe(0.3);
  });
});
