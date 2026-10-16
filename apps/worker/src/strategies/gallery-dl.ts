import { z } from "zod";
import { downloadMedia } from "./download.ts";
import { classifyError } from "./errors.ts";
import { type FetchedFile, type FetchResult, kindOf, type Strategy, type StrategyContext } from "./types.ts";

// `gallery-dl -j` prints the extractor's message stream: [2, kwdict] directory, [3, url, kwdict] file,
// [6, url, kwdict] queued child, [-1, {error, message}] error. We download the files ourselves so
// every request goes through the SSRF guard.
const Messages = z.array(z.array(z.unknown()));
const Kw = z.record(z.string(), z.unknown());

type Kwdict = Record<string, unknown>;

export function parseGalleryDlOutput(stdout: string): { files: { url: string; kw: Kwdict }[]; meta: Kwdict | null; error: string | null } {
  const messages = Messages.parse(JSON.parse(stdout));
  const files: { url: string; kw: Kwdict }[] = [];
  let meta: Kwdict | null = null;
  let error: string | null = null;
  for (const m of messages) {
    const [type, a, b] = m;
    if (type === 2) meta ??= Kw.catch({}).parse(a);
    else if (type === 3 && typeof a === "string" && !a.startsWith("ytdl:")) files.push({ url: a, kw: Kw.catch({}).parse(b) });
    else if (type === -1) {
      const e = Kw.catch({}).parse(a);
      error = [e.error, e.message].filter((x) => typeof x === "string").join(": ") || "gallery-dl error";
    }
  }
  return { files, meta: meta ?? files[0]?.kw ?? null, error };
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : typeof v === "number" ? String(v) : undefined);

function pick(kw: Kwdict, ...paths: string[]): string | undefined {
  for (const p of paths) {
    let v: unknown = kw;
    for (const part of p.split(".")) v = v && typeof v === "object" ? (v as Kwdict)[part] : undefined;
    const s = str(v);
    if (s) return s;
  }
  return undefined;
}

function dateOf(kw: Kwdict): Date | undefined {
  const d = pick(kw, "date", "post_date", "created_at");
  if (!d) return undefined;
  // gallery-dl formats dates as "YYYY-MM-DD HH:MM:SS" in UTC
  const parsed = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(d) ? `${d.replace(" ", "T")}Z` : d);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

const KEEP = ["category", "subcategory", "post_id", "post_shortcode", "shortcode", "id", "username", "fullname", "description", "content", "title", "date", "tags", "likes", "width", "height"];
const trim = (kw: Kwdict) => Object.fromEntries(KEEP.filter((k) => kw[k] !== undefined).map((k) => [k, kw[k]]));

function args(ctx: StrategyContext, extra: string[]): string[] {
  const a = ["--ignore-config", ...extra];
  if (ctx.cookiesFile) a.push("--cookies", ctx.cookiesFile);
  for (const [k, v] of Object.entries(ctx.options.headers)) a.push("-o", `extractor.headers.${k}=${v}`);
  return [...a, "--", ctx.url];
}

export const galleryDl: Strategy = {
  id: "gallery-dl",

  async fetch(ctx): Promise<FetchResult> {
    const { stdout } = await ctx.run("gallery-dl", args(ctx, ["-j", "--range", `1-${ctx.options.maxItems}`]), {
      timeoutMs: 3 * 60_000,
      ...(ctx.signal ? { signal: ctx.signal } : {}),
    });
    const out = parseGalleryDlOutput(stdout.toString("utf8"));
    if (out.error && out.files.length === 0) throw new Error(out.error);
    const files: FetchedFile[] = [];
    for (const [i, f] of out.files.slice(0, ctx.options.maxItems).entries()) {
      files.push(await downloadMedia(ctx, f.url, `gdl-${String(i).padStart(3, "0")}`));
    }
    const kw = out.meta ?? {};
    const handle = pick(kw, "username", "owner_username", "author.name", "user.name", "uploader", "author");
    const name = pick(kw, "fullname", "author.nick", "user.full_name", "owner_name");
    const caption = pick(kw, "description", "content", "caption", "text");
    const title = pick(kw, "title");
    const id = pick(kw, "post_shortcode", "shortcode", "post_id", "id");
    const posted = dateOf(kw);
    return {
      kind: kindOf(files),
      ...(id ? { sourceItemId: id } : {}),
      author: { ...(handle ? { handle } : {}), ...(name ? { name } : {}) },
      ...(title ? { title } : {}),
      ...(caption ? { caption } : {}),
      ...(posted ? { postedAt: posted } : {}),
      files,
      rawMeta: { ...trim(kw), files: out.files.length },
    };
  },

  async probe(ctx) {
    try {
      const { stdout } = await ctx.run("gallery-dl", args(ctx, ["-j", "--range", "1"]), { timeoutMs: 60_000 });
      const out = parseGalleryDlOutput(stdout.toString("utf8"));
      if (out.files.length || out.meta) return "available";
      return out.error && classifyError(new Error(out.error)) === "gone" ? "gone" : "unknown";
    } catch (error) {
      return classifyError(error) === "gone" ? "gone" : "unknown";
    }
  },
};
