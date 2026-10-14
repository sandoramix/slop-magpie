import { lookup as dnsLookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { checkPublicUrl, isIpLiteral, isPublicIp, type UrlCheckFailure } from "@magpie/shared/net";
import { Agent, fetch, type Response } from "undici";

// Every outbound request for a user-supplied URL goes through here. See docs/security.md.

export class BlockedTargetError extends Error {
  override name = "BlockedTargetError";
  readonly reason: UrlCheckFailure | "private_address" | "too_many_redirects" | "too_large";
  constructor(reason: BlockedTargetError["reason"], message: string) {
    super(message);
    this.reason = reason;
  }
}

export type Resolver = (hostname: string) => Promise<LookupAddress[]>;

export interface GuardOptions {
  /** Defaults to the system resolver. */
  resolve?: Resolver;
  /** Defaults to `isPublicIp`. Tests loosen this to reach a local server. */
  isAllowedAddress?: (address: string) => boolean;
  /** Ports allowed besides 80/443. */
  extraPorts?: readonly number[];
}

const systemResolve: Resolver = (hostname) => dnsLookup(hostname, { all: true, verbatim: true });

export interface Guard {
  /** Static check + DNS check of a URL. Returns the parsed URL. */
  assertPublicUrl(input: string): Promise<URL>;
  /** undici Agent whose connections re-check the resolved address (no DNS-rebinding window). */
  agent: Agent;
}

export function createGuard(options: GuardOptions = {}): Guard {
  const resolve = options.resolve ?? systemResolve;
  const allowed = options.isAllowedAddress ?? isPublicIp;
  const checkOptions = options.extraPorts ? { extraPorts: options.extraPorts } : {};

  const resolvePublic = async (hostname: string): Promise<LookupAddress[]> => {
    const bare = hostname.replace(/^\[|\]$/g, "");
    const addresses = isIpLiteral(bare) ? [{ address: bare, family: bare.includes(":") ? 6 : 4 }] : await resolve(bare);
    // any private answer blocks the host: an attacker controls which record we'd pick
    const blocked = addresses.find((a) => !allowed(a.address));
    if (addresses.length === 0 || blocked) {
      throw new BlockedTargetError("private_address", `blocked address for ${hostname}`);
    }
    return addresses;
  };

  const agent = new Agent({
    connect: {
      lookup(hostname, lookupOptions, callback) {
        resolvePublic(hostname).then(
          (addresses) => {
            if (lookupOptions.all) {
              callback(null, addresses);
              return;
            }
            const first = addresses[0];
            if (first) callback(null, first.address, first.family);
          },
          (error: unknown) => {
            callback(error instanceof Error ? error : new Error(String(error)), "", 0);
          },
        );
      },
    },
  });

  return {
    agent,
    async assertPublicUrl(input) {
      const result = checkPublicUrl(input, checkOptions);
      if (!result.ok) throw new BlockedTargetError(result.reason, `blocked url (${result.reason})`);
      await resolvePublic(result.url.hostname);
      return result.url;
    },
  };
}

export interface SafeFetchOptions {
  method?: "GET" | "HEAD";
  headers?: Record<string, string>;
  maxRedirects?: number;
  timeoutMs?: number;
}

export interface SafeFetchResult {
  response: Response;
  /** URL after redirects. */
  url: URL;
  /** Every URL visited, starting with the input. */
  hops: string[];
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** fetch that checks the target and every redirect hop. */
export async function safeFetch(guard: Guard, input: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? 5;
  const signal = AbortSignal.timeout(options.timeoutMs ?? 20_000);
  const hops: string[] = [];
  let url = await guard.assertPublicUrl(input);

  for (;;) {
    hops.push(url.href);
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: options.headers ?? {},
      redirect: "manual",
      dispatcher: guard.agent,
      signal,
    });
    const location = response.headers.get("location");
    if (!REDIRECT_STATUSES.has(response.status) || !location) return { response, url, hops };

    await response.body?.cancel();
    if (hops.length > maxRedirects) {
      throw new BlockedTargetError("too_many_redirects", `more than ${maxRedirects} redirects`);
    }
    url = await guard.assertPublicUrl(new URL(location, url).href);
  }
}

/** Reads a body, failing once it exceeds `maxBytes`. */
export async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new BlockedTargetError("too_large", `response larger than ${maxBytes} bytes`);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (!response.body) return new Uint8Array();
  // undici types the web stream's chunks as any
  const body = response.body as AsyncIterable<Uint8Array>;
  for await (const chunk of body) {
    total += chunk.byteLength;
    if (total > maxBytes) throw new BlockedTargetError("too_large", `response larger than ${maxBytes} bytes`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Follows redirects (HEAD, falling back to GET) and returns the final URL. For short links. */
export async function expandUrl(guard: Guard, input: string): Promise<{ url: URL; hops: string[] }> {
  let result = await safeFetch(guard, input, { method: "HEAD" });
  if (result.response.status === 405 || result.response.status === 403) {
    result = await safeFetch(guard, input, { method: "GET" });
  }
  await result.response.body?.cancel();
  return { url: result.url, hops: result.hops };
}
