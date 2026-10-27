import { describe, expect, it } from "vitest";
import { canonicalKeyword } from "./keyword.ts";

describe("canonicalKeyword", () => {
  it("makes spelling variants equal", () => {
    expect(canonicalKeyword("slow_cooker")).toBe("slow cooker");
    expect(canonicalKeyword("  #Slow   Cooker ")).toBe("slow cooker");
    expect(canonicalKeyword("SLOW_COOKER")).toBe("slow cooker");
  });

  it("splits camel case only when asked, and never inside short prefixes", () => {
    expect(canonicalKeyword("SlowCooker")).toBe("slowcooker");
    expect(canonicalKeyword("SlowCookerRecipes", { camel: true })).toBe("slow cooker recipes");
    expect(canonicalKeyword("iPhone", { camel: true })).toBe("iphone");
    expect(canonicalKeyword("week2Plan", { camel: true })).toBe("week2 plan");
  });

  it("trims dangling apostrophes and hyphens", () => {
    expect(canonicalKeyword("-pasta'")).toBe("pasta");
  });
});
