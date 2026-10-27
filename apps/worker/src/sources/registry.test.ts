import { knownSourceIds } from "@magpie/shared/sources";
import { describe, expect, it } from "vitest";
import { strategies } from "../strategies/index.ts";
import { strategyIds } from "../strategies/types.ts";
import { getFetcher, sourceFetcherIds, strategyOrder } from "./index.ts";

describe("source fetchers", () => {
  it("has a fetcher for every source with code in packages/shared", () => {
    for (const id of knownSourceIds) expect(sourceFetcherIds, id).toContain(id);
    expect(sourceFetcherIds).toContain("generic");
  });

  it("only names strategies that exist", () => {
    for (const id of sourceFetcherIds) {
      for (const strategy of strategyOrder(getFetcher(id), "https://example.com/")) {
        expect(strategyIds, `${id} -> ${strategy}`).toContain(strategy);
        expect(strategies[strategy].id).toBe(strategy);
      }
    }
  });

  it("ends every chain with a metadata fallback so a blocked site still saves a bookmark", () => {
    for (const id of sourceFetcherIds.filter((i) => i !== "generic")) {
      const order = strategyOrder(getFetcher(id), "https://example.com/");
      expect(["opengraph", "oembed"], id).toContain(order.at(-1));
    }
  });

  it("keeps third-party relays behind the tools that talk to the site directly", () => {
    const order = strategyOrder(getFetcher("x"), "https://x.com/a/status/1234567890123");
    expect(order.indexOf("fxtwitter")).toBeGreaterThan(order.indexOf("gallery-dl"));
    expect(order.indexOf("fxtwitter")).toBeGreaterThan(order.indexOf("yt-dlp"));
  });
});
