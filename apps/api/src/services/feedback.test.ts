import { describe, expect, it } from "vitest";
import { consecutiveWeeks } from "./feedback.ts";

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("consecutiveWeeks", () => {
  // 2026-10-28 is a Wednesday
  const now = day("2026-10-28");

  it("is 0 without activity", () => {
    expect(consecutiveWeeks([], now)).toBe(0);
  });

  it("counts weeks in a row up to this week", () => {
    expect(consecutiveWeeks([day("2026-10-26"), day("2026-10-19"), day("2026-10-12")], now)).toBe(3);
  });

  it("does not break on an empty current week", () => {
    expect(consecutiveWeeks([day("2026-10-19"), day("2026-10-12")], now)).toBe(2);
  });

  it("stops at the first gap", () => {
    expect(consecutiveWeeks([day("2026-10-26"), day("2026-10-12"), day("2026-10-05")], now)).toBe(1);
  });

  it("is 0 when the last activity is older than last week", () => {
    expect(consecutiveWeeks([day("2026-10-05")], now)).toBe(0);
  });
});
