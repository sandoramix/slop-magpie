import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ToolError, type Runner } from "../tools/run.ts";
import { instaloader } from "./instaloader.ts";
import { DEFAULT_STRATEGY_OPTIONS, type StrategyContext } from "./types.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "il-test-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const noop = () => undefined;
const log = { debug: noop, info: noop, warn: noop, error: noop } as unknown as StrategyContext["log"];

function context(run: Runner, login: StrategyContext["login"], url = "https://www.instagram.com/p/AbC_d-1/"): StrategyContext {
  return {
    url,
    tmpDir: path.join(dir, "job"),
    cookiesFile: null,
    login,
    guard: undefined as never,
    run,
    log,
    maxDownloadBytes: 1e9,
    options: DEFAULT_STRATEGY_OPTIONS,
  };
}

/** Pretends to be instaloader: writes a carousel of two images plus caption and metadata. */
const writes: Runner = async (_cmd, args) => {
  const out = args[args.indexOf("--dirname-pattern") + 1] ?? "";
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, "AbC_d-1_2.jpg"), "b");
  await writeFile(path.join(out, "AbC_d-1_1.jpg"), "a");
  await writeFile(path.join(out, "AbC_d-1.txt"), "hello\n");
  await writeFile(path.join(out, "AbC_d-1.json"), JSON.stringify({ node: { taken_at_timestamp: 1_700_000_000, owner: { username: "someone", full_name: "Some One" } } }));
  return { stdout: Buffer.alloc(0), stderr: "" };
};

describe("instaloader", () => {
  it("collects a carousel in order with caption and author", async () => {
    const login = { username: "bot", sessionFile: path.join(dir, "s", "instagram.session"), password: () => "pw" };
    const result = await instaloader.fetch(context(writes, login));
    expect(result.files.map((f) => path.basename(f.path))).toEqual(["AbC_d-1_1.jpg", "AbC_d-1_2.jpg"]);
    expect(result).toMatchObject({ kind: "gallery", sourceItemId: "AbC_d-1", caption: "hello", author: { handle: "someone", name: "Some One" } });
    expect(result.postedAt?.getTime()).toBe(1_700_000_000_000);
  });

  it("sends the password on stdin only when there is no session", async () => {
    const seen: { args: readonly string[]; stdin: string | undefined }[] = [];
    const run: Runner = async (cmd, args, options) => {
      seen.push({ args, stdin: options?.stdin?.toString() });
      return writes(cmd, args, options);
    };
    const sessionFile = path.join(dir, "s", "instagram.session");
    const login = { username: "bot", sessionFile, password: () => "pw" };
    await instaloader.fetch(context(run, login));
    expect(seen[0]?.stdin).toBe("pw\n");
    expect(seen[0]?.args.join(" ")).not.toContain("pw");

    await writeFile(sessionFile, "x");
    await instaloader.fetch(context(run, login));
    expect(seen[1]?.stdin).toBeUndefined();
  });

  it("logs in once more when the saved session is dead, then retries", async () => {
    const sessionFile = path.join(dir, "s", "instagram.session");
    await mkdir(path.dirname(sessionFile), { recursive: true });
    await writeFile(sessionFile, "stale");
    let calls = 0;
    const run: Runner = async (cmd, args, options) => {
      calls += 1;
      if (calls === 1) throw new ToolError("instaloader", 3, "Login required");
      return writes(cmd, args, options);
    };
    const result = await instaloader.fetch(context(run, { username: "bot", sessionFile, password: () => "pw" }));
    expect(calls).toBe(2);
    expect(result.files).toHaveLength(2);
  });

  it("does not retry while the login is cooling down", async () => {
    const sessionFile = path.join(dir, "s", "instagram.session");
    await mkdir(path.dirname(sessionFile), { recursive: true });
    await writeFile(sessionFile, "stale");
    let calls = 0;
    const run: Runner = () => {
      calls += 1;
      return Promise.reject(new ToolError("instaloader", 3, "Login required"));
    };
    await expect(instaloader.fetch(context(run, { username: "bot", sessionFile, password: () => null }))).rejects.toThrow(/exited with 3/);
    expect(calls).toBe(1);
  });

  it("fails fast without an account", async () => {
    await expect(instaloader.fetch(context(writes, null))).rejects.toThrow(/INSTAGRAM_USERNAME/);
  });
});
