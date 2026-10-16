import { describe, expect, it } from "vitest";
import { instagram } from "./instagram.ts";

const u = (s: string) => new URL(s);

describe("instagram", () => {
  it.each([
    ["https://www.instagram.com/reel/C9xYz12AbCd/?igsh=MWRhZ3J5", "C9xYz12AbCd"],
    ["https://instagram.com/p/C9xYz12AbCd/", "C9xYz12AbCd"],
    ["https://www.instagram.com/reels/DAbc_-12345/", "DAbc_-12345"],
    ["https://www.instagram.com/tv/B1234567890", "B1234567890"],
    ["https://www.instagram.com/some.user/p/C9xYz12AbCd/?img_index=2", "C9xYz12AbCd"],
    ["https://m.instagram.com/reel/C9xYz12AbCd", "C9xYz12AbCd"],
    ["https://instagr.am/p/C9xYz12AbCd/", "C9xYz12AbCd"],
  ])("extracts the shortcode from %s", (url, id) => {
    expect(instagram.match(u(url))).toBe(true);
    expect(instagram.extractId?.(u(url))).toBe(id);
    expect(instagram.normalize(u(url))).toBe(`https://www.instagram.com/p/${id}`);
  });

  it("does not match other hosts", () => {
    expect(instagram.match(u("https://www.tiktok.com/@a/video/1"))).toBe(false);
    expect(instagram.match(u("https://notinstagram.com/p/C9xYz12AbCd/"))).toBe(false);
  });

  it("normalizes non-post pages without an id", () => {
    const url = u("https://instagram.com/some.user/?igsh=abc&hl=it");
    expect(instagram.extractId?.(url)).toBeNull();
    expect(instagram.normalize(url)).toBe("https://www.instagram.com/some.user");
  });

  it("keeps share links for expansion by the worker", () => {
    const url = u("https://www.instagram.com/share/reel/BAabcdefg/");
    expect(instagram.match(url)).toBe(true);
    expect(instagram.extractId?.(url)).toBeNull();
  });
});
