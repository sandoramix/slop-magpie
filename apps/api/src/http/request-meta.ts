import type { Context } from "hono";
import { clientIp } from "./client-ip.ts";

/** IP + user agent for audit entries. */
export function requestMeta(c: Context, trustProxy: boolean): { ip: string | null; userAgent: string | null } {
  return { ip: clientIp(c, trustProxy), userAgent: c.req.header("user-agent") ?? null };
}
