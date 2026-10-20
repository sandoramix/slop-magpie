import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const TOOLS = [
  { name: "yt-dlp", args: ["--version"] },
  { name: "gallery-dl", args: ["--version"] },
  { name: "instaloader", args: ["--version"] },
  { name: "ffmpeg", args: ["-version"] },
] as const;

/** Versions of the external CLIs; null when a tool is missing. Logged at start-up. */
export async function toolVersions(): Promise<Record<string, string | null>> {
  const entries = await Promise.all(
    TOOLS.map(async ({ name, args }) => {
      try {
        const { stdout } = await run(name, args, { timeout: 10_000 });
        return [name, stdout.split("\n")[0]?.trim() ?? ""] as const;
      } catch {
        return [name, null] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}
