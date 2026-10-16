import { contentTypeForKey } from "@magpie/storage";
import { downloadMedia } from "./download.ts";
import { opengraph } from "./opengraph.ts";
import type { FetchResult, Strategy } from "./types.ts";

/** True when the URL path ends in a media extension we store. */
export function looksLikeMedia(url: string): boolean {
  try {
    const name = new URL(url).pathname.split("/").pop() ?? "";
    return name.includes(".") && contentTypeForKey(name) !== undefined;
  } catch {
    return false;
  }
}

export const direct: Strategy = {
  id: "direct",
  async fetch(ctx): Promise<FetchResult> {
    if (!looksLikeMedia(ctx.url)) throw new Error("not a direct media URL");
    const file = await downloadMedia(ctx, ctx.url, "direct");
    return { kind: file.type === "video" ? "video" : "image", files: [file], rawMeta: { url: ctx.url } };
  },
  probe: (ctx) => opengraph.probe(ctx),
};
