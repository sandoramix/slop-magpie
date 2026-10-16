import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

export function clientIp(c: Context, trustProxy: boolean): string | null {
  if (trustProxy) {
    // the last hop is the one our own proxy appended; earlier ones are client-controlled
    const forwarded = c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim();
    if (forwarded) return forwarded;
  }
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    // no Node socket (e.g. app.request in tests)
    return null;
  }
}
