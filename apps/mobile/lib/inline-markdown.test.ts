import { describe, expect, it } from "vitest";
import { parseInline } from "./inline-markdown";

describe("parseInline", () => {
  it("leaves plain text alone", () => {
    expect(parseInline("Nothing special here.")).toEqual([{ text: "Nothing special here." }]);
    expect(parseInline("")).toEqual([]);
  });

  it("formats bold, code, italic and links without the marks", () => {
    expect(parseInline("A new **Explore** tab and `DISABLED_SOURCES`, see *this* and [docs](https://example.com/a?b=1).")).toEqual([
      { text: "A new " },
      { text: "Explore", bold: true },
      { text: " tab and " },
      { text: "DISABLED_SOURCES", code: true },
      { text: ", see " },
      { text: "this", italic: true },
      { text: " and " },
      { text: "docs", href: "https://example.com/a?b=1" },
      { text: "." },
    ]);
  });

  it("keeps underscores, lone stars and non-web links as text", () => {
    expect(parseInline("slow_cooker costs 2 * 3 and [x](javascript:alert(1))")).toEqual([
      { text: "slow_cooker costs 2 * 3 and [x](javascript:alert(1))" },
    ]);
  });

  it("does not format inside code", () => {
    expect(parseInline("`**not bold**`")).toEqual([{ text: "**not bold**", code: true }]);
  });
});
