import { z } from "zod";
import { ApiError } from "../http/errors.ts";

// Opaque to clients. Keyset for the saved_at sorts; offset for sorts on nullable/computed values.
const Cursor = z.union([
  z.object({ k: z.literal("ks"), s: z.string().max(64), i: z.uuid() }),
  z.object({ k: z.literal("off"), o: z.number().int().nonnegative().max(100_000) }),
]);
export type Cursor = z.infer<typeof Cursor>;

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeCursor(text: string): Cursor {
  try {
    return Cursor.parse(JSON.parse(Buffer.from(text, "base64url").toString("utf8")));
  } catch {
    throw new ApiError(400, "bad_request", "Invalid cursor");
  }
}
