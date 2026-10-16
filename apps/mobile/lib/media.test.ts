import { describe, expect, it } from "vitest";
import { aspectClass, extractUrl, formatDuration } from "./media.ts";

describe("aspectClass", () => {
  it("snaps to the nearest known ratio", () => {
    expect(aspectClass(0.56)).toBe("aspect-[9/16]");
    expect(aspectClass(1.02)).toBe("aspect-square");
    expect(aspectClass(1.78)).toBe("aspect-video");
  });
  it("has a default for unknown ratios", () => {
    expect(aspectClass(null)).toBe("aspect-[4/5]");
  });
});

describe("extractUrl", () => {
  it("finds a link inside shared text", () => {
    expect(extractUrl("Look at this https://www.instagram.com/reel/abc/?igsh=1).")).toBe(
      "https://www.instagram.com/reel/abc/?igsh=1",
    );
  });
  it("returns null without a link", () => {
    expect(extractUrl("no link here")).toBeNull();
    expect(extractUrl(null)).toBeNull();
  });
});

describe("formatDuration", () => {
  it("formats mm:ss", () => {
    expect(formatDuration(65_000)).toBe("1:05");
    expect(formatDuration(null)).toBe("");
  });
});
