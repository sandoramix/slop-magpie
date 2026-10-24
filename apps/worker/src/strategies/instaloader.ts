import { access, mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { contentTypeForKey } from "@magpie/storage";
import { z } from "zod";
import { ToolError } from "../tools/run.ts";
import { classifyError, looksLikeAuthFailure } from "./errors.ts";
import { type FetchedFile, type FetchResult, kindOf, type Strategy, type StrategyContext, type StrategyLogin } from "./types.ts";

// `instaloader -- -<shortcode>` downloads one post into a directory. It owns the Instagram session:
// it loads the session file, and logs in with the password (stdin, never argv) only when that session is dead.
const SHORTCODE = /instagram\.com\/(?:[^/]+\/)?(?:p|reels?|tv)\/([A-Za-z0-9_-]+)/;

const Meta = z.looseObject({
  node: z.looseObject({
    taken_at_timestamp: z.number().optional(),
    owner: z.looseObject({ username: z.string().optional(), full_name: z.string().nullish() }).optional(),
  }),
});

const exists = (file: string) => access(file).then(() => true, () => false);

function shortcodeOf(url: string): string | undefined {
  return SHORTCODE.exec(url)?.[1];
}

function args(login: StrategyLogin, outDir: string, shortcode: string, extra: readonly string[]): string[] {
  return [
    "--login",
    login.username,
    "--sessionfile",
    login.sessionFile,
    "--dirname-pattern",
    outDir,
    "--filename-pattern",
    "{shortcode}",
    "--no-compress-json",
    "--no-profile-pic",
    "--no-resume",
    "--request-timeout",
    "60",
    "--max-connection-attempts",
    "2",
    ...extra,
    "--",
    `-${shortcode}`,
  ];
}

/** A dead or missing session: instaloader exits 3 or asks for the password it was not given. */
function isAuthFailure(error: unknown): boolean {
  if (!(error instanceof ToolError)) return false;
  return error.exitCode === 3 || /EOFError/.test(error.stderr) || looksLikeAuthFailure(`${error.message}\n${error.stderr}`);
}

async function run(ctx: StrategyContext, login: StrategyLogin, outDir: string, shortcode: string, password: string | null, extra: readonly string[], timeoutMs: number) {
  await ctx.run("instaloader", args(login, outDir, shortcode, extra), {
    timeoutMs,
    ...(password !== null ? { stdin: Buffer.from(`${password}\n`) } : {}),
    ...(ctx.signal ? { signal: ctx.signal } : {}),
  });
}

/** Runs instaloader with the saved session; when that is dead, one rate-limited password login, then the same run again. */
async function runWithRelogin(ctx: StrategyContext, login: StrategyLogin, outDir: string, shortcode: string, extra: readonly string[], timeoutMs: number) {
  const hasSession = await exists(login.sessionFile);
  let password = hasSession ? null : login.password();
  if (!hasSession && password === null) throw new Error("instaloader: no session file and no login allowed (INSTAGRAM_PASSWORD unset, or the last login attempt was less than 15 minutes ago)");
  try {
    await run(ctx, login, outDir, shortcode, password, extra, timeoutMs);
  } catch (error) {
    // the thrown message keeps only the last stderr line ("EOFError"), which hides why the session was refused
    if (error instanceof ToolError) ctx.log.warn({ hasSession, stderr: error.stderr.split("\n").slice(-8).join("\n") }, "instaloader stderr");
    if (password !== null || !isAuthFailure(error)) throw error;
    password = login.password();
    if (password === null) throw error;
    await run(ctx, login, outDir, shortcode, password, extra, timeoutMs);
  }
}

const METADATA_ONLY = ["--no-pictures", "--no-videos", "--no-captions", "--no-metadata-json"] as const;

/**
 * Is the Instagram session usable? `ctx.url` is any post that is known to exist. May spend the rate-limited
 * password login, so a dead session heals here instead of on the next user save.
 */
export async function checkSession(ctx: StrategyContext): Promise<"ok" | "dead" | "unknown"> {
  const shortcode = shortcodeOf(ctx.url);
  if (!ctx.login || !shortcode) return "unknown";
  try {
    await mkdir(path.dirname(ctx.login.sessionFile), { recursive: true, mode: 0o700 });
    await runWithRelogin(ctx, ctx.login, path.join(ctx.tmpDir, "instaloader"), shortcode, METADATA_ONLY, 2 * 60_000);
    return "ok";
  } catch (error) {
    if (isAuthFailure(error) || (error instanceof Error && /no session file/.test(error.message))) return "dead";
    return "unknown";
  }
}

async function collect(outDir: string, shortcode: string): Promise<{ files: FetchedFile[]; caption: string | undefined; meta: z.infer<typeof Meta>["node"] | undefined }> {
  const names = await readdir(outDir).catch(() => []);
  const media = new RegExp(`^${shortcode.replace(/[-_]/g, "\\$&")}(?:_(\\d+))?\\.[a-z0-9]+$`);
  const files = names
    .flatMap((name) => {
      const mime = contentTypeForKey(name);
      const index = media.exec(name)?.[1];
      return mime && (mime.startsWith("image/") || mime.startsWith("video/")) && media.test(name) ? [{ name, mime, index: Number(index ?? 0) }] : [];
    })
    .sort((a, b) => a.index - b.index)
    .map((f): FetchedFile => ({ path: path.join(outDir, f.name), mime: f.mime, type: f.mime.startsWith("video/") ? "video" : "image" }));
  const caption = (await readFile(path.join(outDir, `${shortcode}.txt`), "utf8").catch(() => "")).trim() || undefined;
  const raw: unknown = await readFile(path.join(outDir, `${shortcode}.json`), "utf8").then((t) => JSON.parse(t) as unknown, () => null);
  const meta = Meta.safeParse(raw);
  return { files, caption, meta: meta.success ? meta.data.node : undefined };
}

export const instaloader: Strategy = {
  id: "instaloader",

  async fetch(ctx): Promise<FetchResult> {
    const login = ctx.login;
    if (!login) throw new Error("instaloader: no Instagram account configured (INSTAGRAM_USERNAME / INSTAGRAM_PASSWORD)");
    const shortcode = shortcodeOf(ctx.url);
    if (!shortcode) throw new Error("instaloader: not an Instagram post URL");
    await mkdir(path.dirname(login.sessionFile), { recursive: true, mode: 0o700 });
    const outDir = path.join(ctx.tmpDir, "instaloader");

    await runWithRelogin(ctx, login, outDir, shortcode, [], 10 * 60_000);

    const { files, caption, meta } = await collect(outDir, shortcode);
    const handle = meta?.owner?.username;
    const name = meta?.owner?.full_name ?? undefined;
    const posted = meta?.taken_at_timestamp ? new Date(meta.taken_at_timestamp * 1000) : undefined;
    return {
      kind: kindOf(files),
      sourceItemId: shortcode,
      author: { ...(handle ? { handle } : {}), ...(name ? { name } : {}) },
      ...(caption ? { caption } : {}),
      ...(posted ? { postedAt: posted } : {}),
      files,
      rawMeta: { shortcode, files: files.length },
    };
  },

  async probe(ctx) {
    const shortcode = shortcodeOf(ctx.url);
    // never logs in: a probe must not spend a login attempt
    if (!ctx.login || !shortcode || !(await exists(ctx.login.sessionFile))) return "unknown";
    try {
      await run(ctx, ctx.login, path.join(ctx.tmpDir, "instaloader"), shortcode, null, METADATA_ONLY, 2 * 60_000);
      return "available";
    } catch (error) {
      return classifyError(error) === "gone" ? "gone" : "unknown";
    }
  },
};
