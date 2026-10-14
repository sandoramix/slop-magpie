import { describe, expect, it } from "vitest";
import { getSource, isSourceId, resolveSource } from "./index.ts";

describe("resolveSource", () => {
  it("resolves known sites", () => {
    const r = resolveSource(new URL("https://www.instagram.com/reel/C9xYz12AbCd/?utm_source=ig_web_copy_link"));
    expect(r.source.id).toBe("instagram");
    expect(r.sourceItemId).toBe("C9xYz12AbCd");
  });

  it("falls back to generic and strips tracking", () => {
    const r = resolveSource(new URL("https://Example.COM./blog/post/?utm_medium=x&b=2&a=1&fbclid=z#top"));
    expect(r.source.id).toBe("generic");
    expect(r.sourceItemId).toBeNull();
    expect(r.canonicalUrl).toBe("https://example.com/blog/post?a=1&b=2");
  });

  it("keeps the root path slash", () => {
    expect(resolveSource(new URL("https://example.com")).canonicalUrl).toBe("https://example.com/");
  });
});

describe("registry", () => {
  it("knows ids", () => {
    expect(isSourceId("instagram")).toBe(true);
    expect(isSourceId("generic")).toBe(true);
    expect(isSourceId("myspace")).toBe(false);
    expect(getSource("generic")?.label).toBe("Web");
  });
});
