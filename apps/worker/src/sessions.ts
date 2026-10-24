import { copyFile, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { WorkerContext } from "./context.ts";
import type { StrategyLogin } from "./strategies/types.ts";

// Instagram flags accounts that log in in a loop: one password use per source per window, success or not.
const LOGIN_COOLDOWN_MS = 15 * 60_000;

const lastAttempt = new Map<string, number>();

const isFile = (file: string) => stat(file).then((s) => s.isFile(), () => false);

/** The account to log in with for a source, or null without credentials. The session outlives restarts in `SESSIONS_DIR`. */
export function loginFor(ctx: WorkerContext, sourceId: string): StrategyLogin | null {
  const credentials = ctx.logins[sourceId];
  if (!credentials) return null;
  return {
    username: credentials.username,
    sessionFile: path.join(ctx.sessionsDir, `${sourceId}.session`),
    password() {
      if (credentials.password === null) return null;
      const last = lastAttempt.get(sourceId);
      if (last !== undefined && Date.now() - last < LOGIN_COOLDOWN_MS) return null;
      lastAttempt.set(sourceId, Date.now());
      ctx.log.info({ source: sourceId }, "logging in");
      void ctx.audit("session.login", { source: sourceId });
      return credentials.password;
    },
  };
}

export type SessionState = "ok" | "dead";

const stateFile = (ctx: WorkerContext, sourceId: string) => path.join(ctx.sessionsDir, `${sourceId}.state`);

/** Last verdict of the session check; null before the first one. Lives beside the session so it survives restarts. */
export async function readSessionState(ctx: WorkerContext, sourceId: string): Promise<SessionState | null> {
  const text = await readFile(stateFile(ctx, sourceId), "utf8").catch(() => "");
  const state = text.trim();
  return state === "ok" || state === "dead" ? state : null;
}

export async function writeSessionState(ctx: WorkerContext, sourceId: string, state: SessionState): Promise<void> {
  await writeFile(stateFile(ctx, sourceId), `${state}\n`, { mode: 0o600 });
}

/** `COOKIES_DIR/<id>.txt` as a private copy in `tmpDir`: the tools write cookies back on exit and the mount is read-only. */
export async function cookiesFor(ctx: WorkerContext, sourceId: string, tmpDir: string): Promise<string | null> {
  const file = path.join(ctx.cookiesDir, `${sourceId}.txt`);
  if (!(await isFile(file))) return null;
  const copy = path.join(tmpDir, "cookies.txt");
  await copyFile(file, copy);
  return copy;
}
