export interface Cookie {
  name: string;
  value: string;
  domain: string;
  /** Unix seconds; 0 = session cookie. */
  expires: number;
}

/** Parses `Set-Cookie` header values. Expired or deleted cookies are dropped. */
export function parseSetCookies(headers: readonly string[], domain: string, now = Date.now()): Cookie[] {
  const cookies: Cookie[] = [];
  for (const header of headers) {
    const [pair = "", ...attrs] = header.split(";").map((s) => s.trim());
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    let expires = 0;
    for (const attr of attrs) {
      const [key = "", val = ""] = attr.split("=");
      if (/^max-age$/i.test(key) && /^-?\d+$/.test(val)) expires = Math.floor(now / 1000) + Number(val);
      else if (/^expires$/i.test(key) && expires === 0) {
        const t = Date.parse(val);
        if (!Number.isNaN(t)) expires = Math.floor(t / 1000);
      }
    }
    if (value === "" || value === '""' || (expires !== 0 && expires * 1000 <= now)) continue;
    cookies.push({ name, value, domain, expires });
  }
  return cookies;
}

/** Later cookies replace earlier ones of the same name. */
export function mergeCookies(...lists: readonly (readonly Cookie[])[]): Cookie[] {
  const byName = new Map<string, Cookie>();
  for (const c of lists.flat()) byName.set(`${c.domain}|${c.name}`, c);
  return [...byName.values()];
}

/** Netscape cookies.txt, the format yt-dlp and gallery-dl read. */
export function toNetscape(cookies: readonly Cookie[]): string {
  const lines = cookies.map((c) => [`.${c.domain.replace(/^\./, "")}`, "TRUE", "/", "TRUE", String(c.expires), c.name, c.value].join("\t"));
  return `# Netscape HTTP Cookie File\n${lines.join("\n")}\n`;
}
