import { cosine } from "@magpie/shared/topics";
import { describe, expect, it } from "vitest";
import { extractKeywords, isIgnored } from "../text/keywords.ts";
import { fnv1a, hashEmbed } from "./hash.ts";
import { EMBEDDING_DIMENSIONS } from "./types.ts";

const terms = (...t: string[]) => ({ text: t.join(" "), terms: t.map((term) => ({ term, weight: 1 })) });

describe("hash embedder", () => {
  it("is deterministic, unit length and the agreed size", () => {
    const a = hashEmbed(terms("pasta", "carbonara"));
    expect(a).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(hashEmbed(terms("pasta", "carbonara"))).toEqual(a);
    expect(Math.hypot(...a)).toBeCloseTo(1);
    expect(fnv1a("pasta")).toBe(fnv1a("pasta"));
  });

  it("puts items that share vocabulary closer than unrelated ones", () => {
    const base = hashEmbed(terms("pasta", "carbonara", "guanciale", "recipe"));
    const near = hashEmbed(terms("pasta", "carbonara", "pecorino", "recipe"));
    const far = hashEmbed(terms("kayak", "river", "paddle", "trip"));
    expect(cosine(base, near)).toBeGreaterThan(0.5);
    expect(cosine(base, far)).toBeLessThan(0.3);
  });

  it("lets a phrase count towards its words", () => {
    expect(cosine(hashEmbed(terms("slow cooker")), hashEmbed(terms("cooker")))).toBeGreaterThan(0.3);
  });

  it("returns nothing for empty input", () => {
    expect(hashEmbed({ text: "", terms: [] })).toEqual([]);
  });
});

describe("stop terms", () => {
  it("matches a term or any word of a phrase", () => {
    const ignore = new Set(["recipe"]);
    expect(isIgnored("recipe", ignore)).toBe(true);
    expect(isIgnored("slow recipe", ignore)).toBe(true);
    expect(isIgnored("recipes", ignore)).toBe(false);
    expect(isIgnored("pasta", new Set())).toBe(false);
  });

  it("drops ignored hashtags and caption terms from extraction", () => {
    const caption = "Easy pasta recipe tonight. #recipe #pasta pasta recipe";
    const all = extractKeywords({ caption }).map((k) => k.keyword);
    expect(all).toEqual(expect.arrayContaining(["recipe", "pasta"]));
    const filtered = extractKeywords({ caption }, { ignore: new Set(["recipe"]) }).map((k) => k.keyword);
    expect(filtered).toContain("pasta");
    expect(filtered.some((k) => k.includes("recipe"))).toBe(false);
  });
});
