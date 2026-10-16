import { access } from "node:fs/promises";
import { z } from "zod";
import { contentTypeForKey } from "@magpie/storage";
import { classifyError } from "./errors.ts";
import { type FetchedFile, type FetchResult, kindOf, type Strategy, type StrategyContext } from "./types.ts";

const Download = z.looseObject({ filepath: z.string().optional(), _filename: z.string().optional() });

interface YtInfo {
  id?: string | undefined;
  title?: string | undefined;
  description?: string | null | undefined;
  uploader?: string | null | undefined;
  uploader_id?: string | null | undefined;
  uploader_url?: string | null | undefined;
  channel?: string | null | undefined;
  channel_url?: string | null | undefined;
  timestamp?: number | null | undefined;
  upload_date?: string | null | undefined;
  vcodec?: string | null | undefined;
  requested_downloads?: z.infer<typeof Download>[] | undefined;
  entries?: (YtInfo | null)[] | undefined;
  [key: string]: unknown;
}

const YtInfo: z.ZodType<YtInfo> = z.lazy(() =>
  z.looseObject({
    id: z.string().optional(),
    title: z.string().optional(),
    description: z.string().nullish(),
    uploader: z.string().nullish(),
    uploader_id: z.string().nullish(),
    uploader_url: z.string().nullish(),
    channel: z.string().nullish(),
    channel_url: z.string().nullish(),
    timestamp: z.number().nullish(),
    upload_date: z.string().nullish(),
    vcodec: z.string().nullish(),
    requested_downloads: z.array(Download).optional(),
    entries: z.array(YtInfo.nullable()).optional(),
  }),
);

const KEEP = ["id", "title", "description", "uploader", "uploader_id", "webpage_url", "extractor", "timestamp", "duration", "view_count", "like_count", "tags", "categories", "width", "height"];

function trim(info: YtInfo): Record<string, unknown> {
  const out: Record<string, unknown> = Object.fromEntries(KEEP.filter((k) => info[k] !== undefined).map((k) => [k, info[k]]));
  if (info.entries) out.entries = info.entries.filter((e): e is YtInfo => e !== null).map(trim);
  return out;
}

// placeholder titles that say nothing ("Video by someone")
const GENERIC_TITLE = /^(video|post|reel|photo) by\b/i;

function postedAt(info: YtInfo): Date | undefined {
  if (info.timestamp) return new Date(info.timestamp * 1000);
  const d = info.upload_date ? /^(\d{4})(\d{2})(\d{2})$/.exec(info.upload_date) : null;
  return d ? new Date(`${d[1] ?? ""}-${d[2] ?? ""}-${d[3] ?? ""}T00:00:00Z`) : undefined;
}

async function filesOf(info: YtInfo): Promise<FetchedFile[]> {
  const infos = info.entries ? info.entries.filter((e): e is YtInfo => e !== null) : [info];
  const files: FetchedFile[] = [];
  for (const entry of infos) {
    for (const d of entry.requested_downloads ?? []) {
      const p = d.filepath ?? d._filename;
      const mime = p ? contentTypeForKey(p) : undefined;
      if (!p || !mime) continue;
      try {
        await access(p);
      } catch {
        continue;
      }
      files.push({ path: p, mime, type: mime.startsWith("video/") ? "video" : "image" });
    }
  }
  return files;
}

function baseArgs(ctx: StrategyContext): string[] {
  const args = ["--no-progress", "--no-cache-dir", "--socket-timeout", "30", "--retries", "2", "--ignore-config"];
  if (ctx.cookiesFile) args.push("--cookies", ctx.cookiesFile);
  for (const [k, v] of Object.entries(ctx.options.headers)) args.push("--add-header", `${k}:${v}`);
  return args;
}

export const ytDlp: Strategy = {
  id: "yt-dlp",

  async fetch(ctx): Promise<FetchResult> {
    const { stdout } = await ctx.run(
      "yt-dlp",
      [
        ...baseArgs(ctx),
        "-J",
        "--no-simulate",
        "--yes-playlist",
        "--playlist-items",
        `1:${ctx.options.maxItems}`,
        "-f",
        "bv*+ba/b",
        "-S",
        ctx.options.ytdlpFormatSort,
        "--merge-output-format",
        "mp4",
        "--max-filesize",
        String(ctx.maxDownloadBytes),
        "--no-mtime",
        "-o",
        `${ctx.tmpDir}/yt-%(playlist_index|0)03d-%(id).60B.%(ext)s`,
        "--",
        ctx.url,
      ],
      { timeoutMs: 15 * 60_000, ...(ctx.signal ? { signal: ctx.signal } : {}) },
    );
    const info = YtInfo.parse(JSON.parse(stdout.toString("utf8")));
    const files = await filesOf(info);
    const first = info.entries?.find((e): e is YtInfo => e !== null) ?? info;
    const caption = info.description ?? first.description ?? undefined;
    const title = info.title && !GENERIC_TITLE.test(info.title) ? info.title : undefined;
    const handle = info.uploader_id ?? first.uploader_id ?? info.channel ?? undefined;
    const name = info.uploader ?? first.uploader ?? info.channel ?? undefined;
    const url = info.uploader_url ?? info.channel_url ?? first.uploader_url ?? undefined;
    const posted = postedAt(info) ?? postedAt(first);
    return {
      kind: kindOf(files),
      ...(info.id ? { sourceItemId: info.id } : {}),
      author: { ...(handle ? { handle } : {}), ...(name ? { name } : {}), ...(url ? { url } : {}) },
      ...(title ? { title } : {}),
      ...(caption ? { caption } : {}),
      ...(posted ? { postedAt: posted } : {}),
      files,
      rawMeta: trim(info),
    };
  },

  async probe(ctx) {
    try {
      await ctx.run("yt-dlp", [...baseArgs(ctx), "-J", "--skip-download", "--no-playlist", "--", ctx.url], { timeoutMs: 2 * 60_000 });
      return "available";
    } catch (error) {
      return classifyError(error) === "gone" ? "gone" : "unknown";
    }
  },
};
