import { describe, expect, it } from "vitest";
import { mediaUrls, parseEmbed } from "./instagram-embed.ts";

const post = {
  shortcode_media: {
    display_url: "https://cdn.test/cover.jpg",
    is_video: false,
    taken_at_timestamp: 1760000000,
    owner: { username: "chef", full_name: "Chef Anna" },
    edge_media_to_caption: { edges: [{ node: { text: "Three step focaccia #bread" } }] },
    edge_sidecar_to_children: {
      edges: [
        { node: { display_url: "https://cdn.test/1.jpg", is_video: false } },
        { node: { display_url: "https://cdn.test/2.jpg", is_video: false } },
        { node: { display_url: "https://cdn.test/3-thumb.jpg", is_video: true, video_url: "https://cdn.test/3.mp4" } },
      ],
    },
  },
};

describe("instagram embed page", () => {
  it("reads the post from the escaped contextJSON form", () => {
    const context = JSON.stringify({ gql_data: post });
    const html = `<html><script>requireLazy(["x"],function(){init({"contextJSON":${JSON.stringify(context)},"other":1})})</script></html>`;
    const parsed = parseEmbed(html);
    expect(parsed?.owner?.username).toBe("chef");
    expect(mediaUrls(parsed ?? {})).toEqual([
      { url: "https://cdn.test/1.jpg", video: false },
      { url: "https://cdn.test/2.jpg", video: false },
      { url: "https://cdn.test/3.mp4", video: true },
    ]);
  });

  it("reads the post from plain inline JSON, even with braces inside strings", () => {
    const tricky = { shortcode_media: { ...post.shortcode_media, edge_media_to_caption: { edges: [{ node: { text: 'a } tricky "caption" {' } }] } } };
    const html = `<script>window.__additionalDataLoaded('extra',${JSON.stringify(tricky)});</script>`;
    expect(parseEmbed(html)?.edge_media_to_caption?.edges[0]?.node.text).toBe('a } tricky "caption" {');
  });

  it("lists a single post as one item and a video without a url as its picture", () => {
    expect(mediaUrls({ display_url: "https://cdn.test/one.jpg" })).toEqual([{ url: "https://cdn.test/one.jpg", video: false }]);
    expect(mediaUrls({ display_url: "https://cdn.test/v.jpg", is_video: true })).toEqual([{ url: "https://cdn.test/v.jpg", video: false }]);
    expect(mediaUrls({})).toEqual([]);
  });

  it("returns null for pages without post data", () => {
    expect(parseEmbed("<html>Login required</html>")).toBeNull();
    expect(parseEmbed('<script>"contextJSON":"not json"</script>')).toBeNull();
    expect(parseEmbed('"shortcode_media":{broken')).toBeNull();
  });
});
