import { describe, expect, it } from "vitest";
import { ItemListQuery } from "./items.ts";

describe("ItemListQuery", () => {
  it("applies defaults", () => {
    expect(ItemListQuery.parse({})).toEqual({ sort: "saved_desc", limit: 50 });
  });

  it("parses query-string values", () => {
    const q = ItemListQuery.parse({ kind: "video,image", favorite: "true", limit: "10" });
    expect(q.kind).toEqual(["video", "image"]);
    expect(q.favorite).toBe(true);
    expect(q.limit).toBe(10);
  });

  it("rejects unknown enum values", () => {
    expect(ItemListQuery.safeParse({ kind: "audio" }).success).toBe(false);
  });
});
