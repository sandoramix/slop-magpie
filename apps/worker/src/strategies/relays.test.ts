import { describe, expect, it } from "vitest";
import { fxApiUrl } from "./fxtwitter.ts";
import { oembedEndpoint, textFromEmbedHtml } from "./oembed.ts";
import { jsonUrl } from "./reddit-json.ts";

describe("oembed", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/oembed?format=json&url="],
    ["https://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/oembed?format=json&url="],
    ["https://www.tiktok.com/@a/video/7301234567890123456", "https://www.tiktok.com/oembed?url="],
    ["https://x.com/a/status/1234567890123", "https://publish.twitter.com/oembed?omit_script=1&url="],
    ["https://www.reddit.com/r/a/comments/1abc2de", "https://www.reddit.com/oembed?url="],
    ["https://www.pinterest.com/pin/123456789012345678", "https://widgets.pinterest.com/oembed.json?url="],
  ])("finds the endpoint for %s", (url, prefix) => {
    expect(oembedEndpoint(url)?.startsWith(prefix)).toBe(true);
    expect(oembedEndpoint(url)).toContain(encodeURIComponent(url));
  });

  it("has no endpoint for unknown sites, lookalikes or junk", () => {
    expect(oembedEndpoint("https://example.com/post")).toBeNull();
    expect(oembedEndpoint("https://notyoutube.com/watch?v=x")).toBeNull();
    expect(oembedEndpoint("not a url")).toBeNull();
  });

  it("turns embed html into plain text", () => {
    const html = '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">just setting up my twttr &amp; more<br>second line</p>&mdash; jack (@jack) <a href="https://x.com/jack/status/20">March 21, 2006</a></blockquote>';
    expect(textFromEmbedHtml(html)).toBe("just setting up my twttr & more\nsecond line\n&mdash; jack (@jack) March 21, 2006");
    expect(textFromEmbedHtml("<iframe src='x'></iframe>")).toBeUndefined();
  });
});

describe("reddit-json", () => {
  it("builds the JSON url for post and comment links", () => {
    expect(jsonUrl("https://old.reddit.com/r/baking/comments/1abc2de/sourdough_tips/?utm_source=share")).toBe(
      "https://www.reddit.com/r/baking/comments/1abc2de/sourdough_tips.json?raw_json=1&limit=200",
    );
    expect(jsonUrl("https://www.reddit.com/r/baking/comments/1abc2de/sourdough_tips/kx9f2ab/")).toBe(
      "https://www.reddit.com/r/baking/comments/1abc2de/sourdough_tips/kx9f2ab.json?raw_json=1&limit=200",
    );
    expect(jsonUrl("https://redd.it/1abc2de")).toBe("https://www.reddit.com/1abc2de.json?raw_json=1&limit=200");
  });
});

describe("fxtwitter", () => {
  it("maps post links to the API", () => {
    expect(fxApiUrl("https://x.com/jack/status/20?s=20")).toBe("https://api.fxtwitter.com/jack/status/20");
    expect(fxApiUrl("https://x.com/i/web/status/1234567890123")).toBe("https://api.fxtwitter.com/i/status/1234567890123");
    expect(fxApiUrl("https://x.com/jack")).toBeNull();
  });
});
