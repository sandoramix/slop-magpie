import { describe, expect, it } from "vitest";
import { extractHashtags, extractKeywords, extractTerms, titleFromCaption } from "./keywords.ts";

describe("keywords", () => {
  it("extracts hashtags", () => {
    expect(extractHashtags("Pasta! #Carbonara #ricetta_veloce and #carbonara again, not a#b or &#39;")).toEqual(["carbonara", "ricetta_veloce"]);
  });

  it("extracts weighted terms without stopwords", () => {
    const terms = extractTerms("La carbonara è la pasta più buona. Carbonara con guanciale, non pancetta! https://x.com/y @chef");
    expect(terms[0]).toEqual({ keyword: "carbonara", weight: 0.7 });
    const words = terms.map((t) => t.keyword);
    expect(words).toContain("guanciale");
    expect(words).not.toContain("la");
    expect(words).not.toContain("con");
    expect(words).not.toContain("chef");
  });

  it("strips Italian elisions", () => {
    expect(extractTerms("dell'olio l’acqua").map((t) => t.keyword)).toEqual(["acqua", "olio"]);
  });

  it("does not duplicate hashtags as caption terms", () => {
    const k = extractKeywords({ title: null, caption: "carbonara #carbonara" });
    expect(k).toEqual([{ keyword: "carbonara", source: "hashtag", weight: 1 }]);
  });

  it("builds titles from captions", () => {
    expect(titleFromCaption("#reels #food\nBest   pasta ever\nmore")).toBe("Best pasta ever");
    expect(titleFromCaption("word ".repeat(50), 20)).toBe("word word word word…");
    expect(titleFromCaption("#only #tags")).toBeNull();
  });
});
