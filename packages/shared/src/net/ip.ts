// Pure IP classification used by the API pre-check and the worker's SSRF guard.
// Anything that is not clearly public unicast is treated as blocked.

type Cidr4 = readonly [base: number, bits: number];

const BLOCKED_V4: readonly Cidr4[] = [
  [ipv4ToInt("0.0.0.0"), 8], // "this" network
  [ipv4ToInt("10.0.0.0"), 8], // RFC 1918
  [ipv4ToInt("100.64.0.0"), 10], // CGNAT, Tailscale
  [ipv4ToInt("127.0.0.0"), 8], // loopback
  [ipv4ToInt("169.254.0.0"), 16], // link-local, cloud metadata
  [ipv4ToInt("172.16.0.0"), 12], // RFC 1918
  [ipv4ToInt("192.0.0.0"), 24], // IETF protocol assignments
  [ipv4ToInt("192.0.2.0"), 24], // TEST-NET-1
  [ipv4ToInt("192.88.99.0"), 24], // 6to4 relay anycast
  [ipv4ToInt("192.168.0.0"), 16], // RFC 1918
  [ipv4ToInt("198.18.0.0"), 15], // benchmarking
  [ipv4ToInt("198.51.100.0"), 24], // TEST-NET-2
  [ipv4ToInt("203.0.113.0"), 24], // TEST-NET-3
  [ipv4ToInt("224.0.0.0"), 4], // multicast
  [ipv4ToInt("240.0.0.0"), 4], // reserved + broadcast
];

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

function ipv4ToInt(address: string): number {
  return address.split(".").reduce((acc, octet) => acc * 256 + Number(octet), 0);
}

export function isIPv4(address: string): boolean {
  return IPV4.test(address);
}

/** Parses an IPv6 address into 8 16-bit groups, or null. Zone ids (`%eth0`) are rejected. */
export function parseIPv6(address: string): number[] | null {
  if (!address.includes(":") || address.includes("%")) return null;
  let text = address.toLowerCase();

  // rewrite a dotted IPv4 tail (::ffff:1.2.3.4) as two hex groups
  const lastColon = text.lastIndexOf(":");
  const maybeV4 = text.slice(lastColon + 1);
  if (maybeV4.includes(".")) {
    if (!isIPv4(maybeV4)) return null;
    const n = ipv4ToInt(maybeV4);
    text = `${text.slice(0, lastColon + 1)}${Math.floor(n / 0x10000).toString(16)}:${(n % 0x10000).toString(16)}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parseGroups = (part: string | undefined): number[] | null => {
    if (part === undefined || part === "") return [];
    const groups = part.split(":");
    const out: number[] = [];
    for (const g of groups) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const head = parseGroups(halves[0]);
  const rest = parseGroups(halves[1]);
  if (!head || !rest) return null;

  const explicit = head.length + rest.length;
  if (halves.length === 2) {
    if (explicit > 7) return null;
    return [...head, ...Array<number>(8 - explicit).fill(0), ...rest];
  }
  return explicit === 8 ? head : null;
}

function isPublicIPv4(address: string): boolean {
  const n = ipv4ToInt(address);
  return !BLOCKED_V4.some(([base, bits]) => {
    const size = 2 ** (32 - bits);
    return n >= base && n < base + size;
  });
}

function embeddedV4(groups: readonly number[], hi: number, lo: number): string {
  const a = groups[hi] ?? 0;
  const b = groups[lo] ?? 0;
  return [a >> 8, a & 0xff, b >> 8, b & 0xff].join(".");
}

function isPublicIPv6(groups: readonly number[]): boolean {
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0] = groups;

  // IPv4-mapped ::ffff:a.b.c.d and NAT64 64:ff9b::a.b.c.d — judge the embedded address
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    return isPublicIPv4(embeddedV4(groups, 6, 7));
  }
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return isPublicIPv4(embeddedV4(groups, 6, 7));
  }
  // 6to4 2002:a.b.c.d::/48
  if (g0 === 0x2002) return isPublicIPv4(embeddedV4(groups, 1, 2));

  // only global unicast 2000::/3 is allowed (excludes ::, ::1, fc00::/7, fe80::/10, ff00::/8, ...)
  if ((g0 & 0xe000) !== 0x2000) return false;
  if (g0 === 0x2001 && g1 === 0x0db8) return false; // documentation
  if (g0 === 0x2001 && g1 < 0x0200) return false; // 2001::/23 IETF protocol assignments, incl. Teredo
  return true;
}

/** True when the literal address is a public unicast address. Unparseable input is not public. */
export function isPublicIp(address: string): boolean {
  const bare = address.startsWith("[") && address.endsWith("]") ? address.slice(1, -1) : address;
  if (isIPv4(bare)) return isPublicIPv4(bare);
  const groups = parseIPv6(bare);
  return groups ? isPublicIPv6(groups) : false;
}

export function isIpLiteral(host: string): boolean {
  const bare = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  return isIPv4(bare) || parseIPv6(bare) !== null;
}
