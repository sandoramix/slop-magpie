import { describe, expect, it } from "vitest";
import { enabledSourcesWithout, needsExpansion, parseSourceIds, resolveSource } from "./index.ts";
import { facebook } from "./facebook.ts";
import { pinterest } from "./pinterest.ts";
import { reddit } from "./reddit.ts";
import { tiktok } from "./tiktok.ts";
import { x } from "./x.ts";
import { youtube } from "./youtube.ts";

const u = (s: string) => new URL(s);

describe("tiktok", () => {
  it.each([
    ["https://www.tiktok.com/@some.user/video/7301234567890123456?is_from_webapp=1&sender_device=pc", "7301234567890123456", "https://www.tiktok.com/@some.user/video/7301234567890123456"],
    ["https://m.tiktok.com/@a_b/photo/7301234567890123456", "7301234567890123456", "https://www.tiktok.com/@a_b/photo/7301234567890123456"],
  ])("normalizes %s", (url, id, canonical) => {
    expect(tiktok.match(u(url))).toBe(true);
    expect(tiktok.extractId?.(u(url))).toBe(id);
    expect(tiktok.normalize(u(url))).toBe(canonical);
  });

  it("marks shortener links for expansion", () => {
    expect(tiktok.needsExpansion?.(u("https://vm.tiktok.com/ZMabc123/"))).toBe(true);
    expect(tiktok.needsExpansion?.(u("https://www.tiktok.com/t/ZTabc123/"))).toBe(true);
    expect(tiktok.needsExpansion?.(u("https://www.tiktok.com/@a/video/7301234567890123456"))).toBe(false);
  });
});

describe("youtube", () => {
  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&si=abc",
    "https://youtu.be/dQw4w9WgXcQ?si=abc",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
  ])("makes %s one video", (url) => {
    expect(youtube.match(u(url))).toBe(true);
    expect(youtube.extractId?.(u(url))).toBe("dQw4w9WgXcQ");
    expect(youtube.normalize(u(url))).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("keeps the list of a playlist link and ignores bad ids", () => {
    expect(youtube.normalize(u("https://www.youtube.com/playlist?list=PL123&si=x"))).toBe("https://www.youtube.com/playlist?list=PL123");
    expect(youtube.extractId?.(u("https://www.youtube.com/watch?v=short"))).toBeNull();
  });
});

describe("pinterest", () => {
  it.each([
    "https://www.pinterest.com/pin/123456789012345678/",
    "https://pinterest.co.uk/pin/123456789012345678/?utm_source=x",
    "https://it.pinterest.com/pin/my-nice-pin--123456789012345678",
  ])("normalizes %s", (url) => {
    expect(pinterest.match(u(url))).toBe(true);
    expect(pinterest.extractId?.(u(url))).toBe("123456789012345678");
    expect(pinterest.normalize(u(url))).toBe("https://www.pinterest.com/pin/123456789012345678");
  });

  it("matches the shortener and not lookalikes", () => {
    expect(pinterest.match(u("https://pin.it/abc123"))).toBe(true);
    expect(pinterest.needsExpansion?.(u("https://pin.it/abc123"))).toBe(true);
    expect(pinterest.match(u("https://notpinterest.com/pin/123456789"))).toBe(false);
    expect(pinterest.match(u("https://pinterest.evil.com/pin/123456789"))).toBe(false);
  });
});

describe("x", () => {
  it.each([
    "https://twitter.com/jack/status/20?s=20",
    "https://x.com/jack/status/20/photo/1",
    "https://mobile.twitter.com/jack/status/20",
    "https://fxtwitter.com/jack/status/20",
    "https://vxtwitter.com/jack/status/20",
  ])("treats %s as one post", (url) => {
    // ids below five digits are not real posts; use a realistic one in the assertion
    expect(x.match(u(url))).toBe(true);
    expect(x.extractId?.(u(url.replace("/20", "/1234567890123")))).toBe("1234567890123");
    expect(x.normalize(u(url.replace("/20", "/1234567890123")))).toBe("https://x.com/jack/status/1234567890123");
  });

  it("handles /i/web/status links", () => {
    expect(x.normalize(u("https://x.com/i/web/status/1234567890123"))).toBe("https://x.com/i/status/1234567890123");
  });
});

describe("reddit", () => {
  it.each([
    "https://www.reddit.com/r/baking/comments/1abc2de/sourdough_tips/?utm_source=share",
    "https://old.reddit.com/r/baking/comments/1abc2de/",
    "https://np.reddit.com/r/baking/comments/1abc2de/sourdough_tips",
  ])("normalizes %s", (url) => {
    expect(reddit.extractId?.(u(url))).toBe("1abc2de");
    expect(reddit.normalize(u(url))).toBe("https://www.reddit.com/r/baking/comments/1abc2de");
  });

  it("reads redd.it ids and comment links", () => {
    expect(reddit.extractId?.(u("https://redd.it/1abc2de"))).toBe("1abc2de");
    expect(reddit.normalize(u("https://redd.it/1abc2de"))).toBe("https://www.reddit.com/comments/1abc2de");
    const comment = u("https://www.reddit.com/r/baking/comments/1abc2de/sourdough_tips/kx9f2ab/");
    expect(reddit.extractCommentId?.(comment)).toBe("kx9f2ab");
    expect(reddit.extractId?.(comment)).toBe("1abc2de");
  });

  it("expands share links", () => {
    expect(reddit.needsExpansion?.(u("https://www.reddit.com/r/baking/s/AbCdEf123"))).toBe(true);
    expect(reddit.needsExpansion?.(u("https://www.reddit.com/r/baking/comments/1abc2de/x"))).toBe(false);
  });
});

describe("facebook", () => {
  it("normalizes reels and watch links", () => {
    expect(facebook.normalize(u("https://m.facebook.com/reel/1234567890123?mibextid=x"))).toBe("https://www.facebook.com/reel/1234567890123");
    expect(facebook.extractId?.(u("https://www.facebook.com/watch/?v=1234567890123&ref=x"))).toBe("1234567890123");
    expect(facebook.normalize(u("https://www.facebook.com/watch/?v=1234567890123&ref=x"))).toBe("https://www.facebook.com/watch?v=1234567890123");
    expect(facebook.extractId?.(u("https://www.facebook.com/somepage/videos/1234567890123/"))).toBe("1234567890123");
  });

  it("expands share links and fb.watch", () => {
    expect(facebook.needsExpansion?.(u("https://www.facebook.com/share/v/AbC123/"))).toBe(true);
    expect(facebook.needsExpansion?.(u("https://fb.watch/abc123/"))).toBe(true);
    expect(facebook.needsExpansion?.(u("https://www.facebook.com/reel/1234567890123"))).toBe(false);
  });
});

describe("disabling sources", () => {
  const tiktokUrl = new URL("https://www.tiktok.com/@a/video/7301234567890123456");

  it("matches every source by default", () => {
    expect(resolveSource(tiktokUrl).source.id).toBe("tiktok");
    expect(resolveSource(new URL("https://www.instagram.com/p/C9xYz12AbCd/")).source.id).toBe("instagram");
    expect(resolveSource(new URL("https://example.com/")).source.id).toBe("generic");
  });

  it("saves a disabled source as generic", () => {
    expect(resolveSource(tiktokUrl, enabledSourcesWithout(["tiktok"])).source.id).toBe("generic");
    expect(resolveSource(new URL("https://www.instagram.com/p/C9xYz12AbCd/"), enabledSourcesWithout(["tiktok"])).source.id).toBe("instagram");
    expect(resolveSource(tiktokUrl, []).source.id).toBe("generic");
  });

  it("parses the env list, ignoring unknown and generic ids", () => {
    expect(parseSourceIds("tiktok, YouTube,myspace,generic")).toEqual(["tiktok", "youtube"]);
    expect(parseSourceIds("")).toEqual([]);
    expect(enabledSourcesWithout(parseSourceIds("x,reddit"))).toEqual(["instagram", "tiktok", "youtube", "pinterest", "facebook"]);
  });

  it("knows which links need following", () => {
    expect(needsExpansion(new URL("https://vm.tiktok.com/ZMabc/"))).toBe(true);
    expect(needsExpansion(new URL("https://www.instagram.com/share/reel/BAabcdefg/"))).toBe(true);
    expect(needsExpansion(new URL("https://example.com/"))).toBe(false);
  });
});