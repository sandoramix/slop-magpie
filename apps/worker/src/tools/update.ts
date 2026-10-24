import { access, rename, rm } from "node:fs/promises";
import path from "node:path";
import type { Logger } from "../logger.ts";
import type { Runner } from "./run.ts";

// The image bakes in yt-dlp, gallery-dl and instaloader, but sites change faster than we redeploy. Newer releases are
// installed into a writable dir that shadows the baked ones, so a broken extractor heals without a rebuild.
const PACKAGES = ["yt-dlp", "gallery-dl", "instaloader"] as const;
const CHECKS: readonly (readonly [string, string])[] = [
  ["yt-dlp", "--version"],
  ["gallery-dl", "--version"],
  ["instaloader", "--version"],
];

const exists = (file: string) => access(file).then(() => true, () => false);

export const toolsDirFor = (sessionsDir: string) => path.join(sessionsDir, "pytools");

/**
 * Installs the latest releases next to the live dir, checks that they start, then swaps them in; a bad release is
 * rolled back. The old dir keeps working until the swap, so a failed download never breaks fetching.
 */
export async function updateTools(run: Runner, log: Logger, dir: string): Promise<void> {
  const next = `${dir}.next`;
  const prev = `${dir}.prev`;
  await rm(next, { recursive: true, force: true });
  await rm(prev, { recursive: true, force: true });
  await run("pip", ["install", "--upgrade", "--no-cache-dir", "--disable-pip-version-check", "--quiet", "--target", next, ...PACKAGES], { timeoutMs: 10 * 60_000 });

  const hadLive = await exists(dir);
  if (hadLive) await rename(dir, prev);
  await rename(next, dir);
  try {
    for (const [tool, flag] of CHECKS) await run(tool, [flag], { timeoutMs: 60_000 });
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    if (hadLive) await rename(prev, dir);
    throw new Error(`updated tools do not start, rolled back: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  await rm(prev, { recursive: true, force: true });
  log.info("download tools updated");
}
