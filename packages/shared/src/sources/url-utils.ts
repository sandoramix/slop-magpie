// query params that never change what a URL points to
const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "igsh",
  "igshid",
  "mc_cid",
  "mc_eid",
  "ref_src",
  "ref_url",
  "si",
  "_ga",
  "_gl",
  "yclid",
]);

export function isTrackingParam(name: string): boolean {
  const key = name.toLowerCase();
  return key.startsWith("utm_") || TRACKING_PARAMS.has(key);
}

export function hostMatches(url: URL, hosts: readonly string[]): boolean {
  return hosts.includes(url.hostname.toLowerCase().replace(/\.$/, ""));
}

/**
 * Generic canonical form: lowercase host without trailing dot, no default port, no fragment,
 * no tracking params, remaining params sorted, no trailing slash except for the root path.
 */
export function canonicalize(url: URL, options: { keepParams?: (name: string) => boolean } = {}): string {
  const out = new URL(url.href);
  out.hostname = out.hostname.toLowerCase().replace(/\.$/, "");
  out.hash = "";
  const keep = options.keepParams ?? ((name: string) => !isTrackingParam(name));
  const params = [...out.searchParams.entries()]
    .filter(([name]) => keep(name))
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  out.search = new URLSearchParams(params).toString();
  if (out.pathname.length > 1) out.pathname = out.pathname.replace(/\/+$/, "");
  return out.href;
}
