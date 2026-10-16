// Minimal, dependency-free extraction of page metadata (OpenGraph, Twitter cards, JSON-LD).

export interface PageMeta {
  title?: string;
  description?: string;
  siteName?: string;
  author?: string;
  publishedAt?: string;
  canonical?: string;
  image?: string;
  video?: string;
  videoType?: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    const [, name, a, b, c] = m;
    if (name) out[name.toLowerCase()] = decodeEntities(a ?? b ?? c ?? "");
  }
  return out;
}

function jsonLdObjects(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") {
      out.push(v as Record<string, unknown>);
      const graph = (v as Record<string, unknown>)["@graph"];
      if (graph) visit(graph);
    }
  };
  for (const m of html.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(m[1] ?? ""));
    } catch {
      // broken JSON-LD is common; ignore
    }
  }
  return out;
}

const firstString = (...values: unknown[]): string | undefined => {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Array.isArray(v)) {
      const s = firstString(...(v as unknown[]));
      if (s) return s;
    }
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const s = firstString(o.url, o.contentUrl, o.name);
      if (s) return s;
    }
  }
  return undefined;
};

export function parsePageMeta(html: string, baseUrl: string): PageMeta {
  const head = html.slice(0, 1_000_000);
  const meta = new Map<string, string>();
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const key = (a.property ?? a.name ?? a.itemprop)?.toLowerCase();
    if (key && a.content !== undefined && !meta.has(key)) meta.set(key, a.content.trim());
  }
  let canonical: string | undefined;
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    if (a.rel?.toLowerCase().split(/\s+/).includes("canonical") && a.href) canonical = a.href;
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  const ld = jsonLdObjects(head);
  const ldGet = (key: string) => firstString(...ld.map((o) => o[key]));

  const abs = (u: string | undefined) => {
    if (!u) return undefined;
    try {
      const url = new URL(u, baseUrl);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
    } catch {
      return undefined;
    }
  };
  const g = (k: string) => meta.get(k) || undefined;

  const title = g("og:title") ?? g("twitter:title") ?? ldGet("headline") ?? (titleTag ? decodeEntities(titleTag).replace(/\s+/g, " ").trim() : undefined);
  const description = g("og:description") ?? g("twitter:description") ?? g("description") ?? ldGet("description");
  const siteName = g("og:site_name") ?? g("application-name");
  const author = g("article:author") ?? g("author") ?? g("twitter:creator") ?? firstString(...ld.map((o) => o.author));
  const publishedAt = g("article:published_time") ?? g("og:published_time") ?? ldGet("datePublished") ?? ldGet("uploadDate");
  const image = abs(g("og:image:secure_url") ?? g("og:image:url") ?? g("og:image") ?? g("twitter:image") ?? g("twitter:image:src") ?? ldGet("image") ?? ldGet("thumbnailUrl"));
  const video = abs(g("og:video:secure_url") ?? g("og:video:url") ?? g("og:video") ?? g("twitter:player:stream") ?? ldGet("contentUrl"));
  const videoType = g("og:video:type");
  const canon = abs(canonical ?? g("og:url"));

  const out: PageMeta = {};
  if (title) out.title = title;
  if (description) out.description = description;
  if (siteName) out.siteName = siteName;
  if (author && !/^https?:/i.test(author)) out.author = author;
  if (publishedAt) out.publishedAt = publishedAt;
  if (canon) out.canonical = canon;
  if (image) out.image = image;
  if (video) out.video = video;
  if (videoType) out.videoType = videoType;
  return out;
}
