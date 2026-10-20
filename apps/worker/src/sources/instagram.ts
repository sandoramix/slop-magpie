import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SourceFetcher } from "./types.ts";

export const instagram: SourceFetcher = {
  id: "instagram",
  // reels/videos via yt-dlp; image posts and carousels (where yt-dlp finds no video) via gallery-dl
  strategies: ["yt-dlp", "gallery-dl"],

  // yt-dlp cannot log in to Instagram, so gallery-dl does it and exports the cookies for both tools.
  // Credentials go through a 0600 config file, not argv (visible in the process list).
  async login({ run, tmpDir, credentials }, cookiesFile) {
    const config = path.join(tmpDir, "gallery-dl.json");
    await writeFile(config, JSON.stringify({ extractor: { instagram: { ...credentials } } }), { mode: 0o600 });
    await run(
      "gallery-dl",
      ["--config", config, "--cookies-export", cookiesFile, "-j", "--range", "1", "--", "https://www.instagram.com/instagram/"],
      { timeoutMs: 90_000 },
    );
    if (!/\tsessionid\t/.test(await readFile(cookiesFile, "utf8"))) throw new Error("login did not return a session (checkpoint or wrong password?)");
  },
};
