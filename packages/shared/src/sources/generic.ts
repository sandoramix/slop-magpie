import type { SourceDef } from "./types.ts";
import { canonicalize } from "./url-utils.ts";

/** Fallback for any site without a dedicated source. Always matches. */
export const generic: SourceDef = {
  id: "generic",
  label: "Web",
  hosts: [],
  match: () => true,
  normalize: (url) => canonicalize(url),
};
