import { isIpLiteral, isPublicIp } from "./ip.ts";

export type UrlCheckFailure =
  | "invalid_url"
  | "unsupported_scheme"
  | "credentials_in_url"
  | "blocked_port"
  | "blocked_host";

export type UrlCheckResult = { ok: true; url: URL } | { ok: false; reason: UrlCheckFailure };

export interface UrlCheckOptions {
  /** Ports allowed besides the scheme default. Default: none (80/443 only). */
  extraPorts?: readonly number[];
}

// hostnames that only make sense on a private network
const INTERNAL_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home.arpa", ".intranet", ".corp"];

/**
 * Static pre-check of a user-supplied URL, without DNS. Rejects anything that is not a plain
 * public http(s) URL. Hostnames still need the resolve-time check in the worker's SSRF guard.
 */
export function checkPublicUrl(input: string, options: UrlCheckOptions = {}): UrlCheckResult {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "unsupported_scheme" };
  if (url.username !== "" || url.password !== "") return { ok: false, reason: "credentials_in_url" };
  if (url.port !== "" && !(options.extraPorts ?? []).includes(Number(url.port))) {
    return { ok: false, reason: "blocked_port" };
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (isIpLiteral(host)) {
    return isPublicIp(host) ? { ok: true, url } : { ok: false, reason: "blocked_host" };
  }
  // single-label names (e.g. "router") resolve through the LAN's search domain
  if (!host.includes(".") || host === "localhost" || INTERNAL_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, reason: "blocked_host" };
  }
  return { ok: true, url };
}
