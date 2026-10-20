import { copyFile, stat } from "node:fs/promises";
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
      const last = lastAttempt.get(sourceId);
      if (last !== undefined && Date.now() - last < LOGIN_COOLDOWN_MS) return null;
      lastAttempt.set(sourceId, Date.now());
      ctx.log.info({ source: sourceId }, "logging in");
      void ctx.audit("session.login", { source: sourceId });
      return credentials.password;
    },
  };
}

/** `COOKIES_DIR/<id>.txt` as a private copy in `tmpDir`: the tools write cookies back on exit and the mount is read-only. */
export async function cookiesFor(ctx: WorkerContext, sourceId: string, tmpDir: string): Promise<string | null> {
  const file = path.join(ctx.cookiesDir, `${sourceId}.txt`);
  if (!(await isFile(file))) return null;
  const copy = path.join(tmpDir, "cookies.txt");
  await copyFile(file, copy);
  return copy;
}
