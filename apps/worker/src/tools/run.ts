import { spawn } from "node:child_process";

export class ToolError extends Error {
  override name = "ToolError";
  readonly tool: string;
  readonly exitCode: number | null;
  /** Last lines of stderr, for classification and `fetch_error`. Never contains cookies. */
  readonly stderr: string;
  constructor(tool: string, exitCode: number | null, stderr: string, message?: string) {
    super(message ?? `${tool} exited with ${exitCode ?? "signal"}: ${lastLine(stderr)}`);
    this.tool = tool;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

const lastLine = (text: string) =>
  text
    .trim()
    .split("\n")
    .filter((l) => l.trim())
    .slice(-1)[0]
    ?.slice(0, 300) ?? "";

export interface RunOptions {
  timeoutMs?: number;
  /** stdout cap; the process is killed beyond it. */
  maxStdoutBytes?: number;
  cwd?: string;
  signal?: AbortSignal;
  stdin?: Buffer;
}

export interface RunResult {
  stdout: Buffer;
  stderr: string;
}

let childEnv: NodeJS.ProcessEnv | undefined;

/** Environment of every CLI started by `runTool` from now on; unset = inherit. */
export function setToolEnv(env: NodeJS.ProcessEnv): void {
  childEnv = env;
}

/** Runs a CLI without a shell. Rejects with ToolError on non-zero exit, timeout or oversize output. */
export type Runner = (command: string, args: readonly string[], options?: RunOptions) => Promise<RunResult>;

export const runTool: Runner = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: childEnv,
      stdio: [options.stdin ? "pipe" : "ignore", "pipe", "pipe"],
      signal: options.signal,
    });
    const max = options.maxStdoutBytes ?? 64 * 1024 * 1024;
    const out: Buffer[] = [];
    let outBytes = 0;
    let err = "";
    let killedReason: string | null = null;
    const kill = (reason: string) => {
      killedReason ??= reason;
      child.kill("SIGKILL");
    };
    const timer = setTimeout(() => {
      kill(`timed out after ${Math.round((options.timeoutMs ?? 0) / 1000)} s`);
    }, options.timeoutMs ?? 10 * 60_000);

    child.stdout?.on("data", (chunk: Buffer) => {
      outBytes += chunk.length;
      if (outBytes > max) kill("output too large");
      else out.push(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      // keep the tail only
      err = (err + chunk.toString("utf8")).slice(-8000);
    });
    if (options.stdin && child.stdin) child.stdin.end(options.stdin);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new ToolError(command, null, err, `${command}: ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (killedReason) reject(new ToolError(command, code, err, `${command}: ${killedReason}`));
      else if (code !== 0) reject(new ToolError(command, code, err));
      else resolve({ stdout: Buffer.concat(out), stderr: err });
    });
  });
