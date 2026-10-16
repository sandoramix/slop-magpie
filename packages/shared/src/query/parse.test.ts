import { describe, expect, it } from "vitest";
import { isPlainText, parseDateRange, parseQuery } from "./parse.ts";

const NOW = new Date("2026-10-14T12:00:00Z");

describe("parseQuery", () => {
  it("parses the documented example", () => {
    const q = parseQuery(
      'pasta limone tag:cibo folder:"Ricette/Primi" is:fav status:to_try from:@author source:instagram kind:video saved:>2026-01-01',
      NOW,
    );
    expect(q.terms).toEqual(["pasta", "limone"]);
    expect(q.tags).toEqual(["cibo"]);
    expect(q.folders).toEqual(["Ricette/Primi"]);
    expect(q.favorite).toBe(true);
    expect(q.workflows).toEqual(["to_try"]);
    expect(q.authors).toEqual(["author"]);
    expect(q.sources).toEqual(["instagram"]);
    expect(q.kinds).toEqual(["video"]);
    expect(q.saved).toEqual({ from: "2026-01-02" });
    expect(q.invalid).toEqual([]);
  });

  it("handles negation, phrases and fields", () => {
    const q = parseQuery('"olio extra" -tag:old -burro field:rating>=3 field:cuisine=thai -kind:link', NOW);
    expect(q.terms).toEqual(["olio extra"]);
    expect(q.excludedTerms).toEqual(["burro"]);
    expect(q.excludedTags).toEqual(["old"]);
    expect(q.excludedKinds).toEqual(["link"]);
    expect(q.fields).toEqual([
      { key: "rating", op: "gte", value: "3" },
      { key: "cuisine", op: "eq", value: "thai" },
    ]);
  });

  it("keeps unknown qualifiers as text and flags bad values", () => {
    const q = parseQuery("https://example.com note:x kind:audio saved:yesterday", NOW);
    expect(q.terms).toEqual(["https://example.com", "note:x"]);
    expect(q.invalid).toEqual(["kind:audio", "saved:yesterday"]);
  });

  it("knows is: shortcuts", () => {
    const q = parseQuery("is:gone is:failed is:inbox -is:fav", NOW);
    expect(q.gone).toBe(true);
    expect(q.fetchStatus).toBe("failed");
    expect(q.workflows).toEqual(["inbox"]);
    expect(q.favorite).toBe(false);
  });

  it("detects plain text", () => {
    expect(isPlainText(parseQuery("just words", NOW))).toBe(true);
    expect(isPlainText(parseQuery("words tag:x", NOW))).toBe(false);
    expect(isPlainText(parseQuery("saved:2026", NOW))).toBe(false);
  });
});

describe("parseDateRange", () => {
  it("parses periods and comparisons", () => {
    expect(parseDateRange("2026", NOW)).toEqual({ from: "2026-01-01", to: "2027-01-01" });
    expect(parseDateRange("2026-02", NOW)).toEqual({ from: "2026-02-01", to: "2026-03-01" });
    expect(parseDateRange("<=2026-02-28", NOW)).toEqual({ to: "2026-03-01" });
    expect(parseDateRange("<2026-02-28", NOW)).toEqual({ to: "2026-02-28" });
    expect(parseDateRange(">=2026-12", NOW)).toEqual({ from: "2026-12-01" });
    expect(parseDateRange("2026-01..2026-03", NOW)).toEqual({ from: "2026-01-01", to: "2026-04-01" });
    expect(parseDateRange("7d", NOW)).toEqual({ from: "2026-10-07" });
    expect(parseDateRange("2026-02-30", NOW)).toBeNull();
    expect(parseDateRange("2026-13", NOW)).toBeNull();
  });
});
