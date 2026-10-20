import { chmod, copyFile, mkdir, mkdtemp, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { WorkerContext } from "./context.ts";
import { getFetcher } from "./sources/index.ts";
import { errorMessage } from "./strategies/errors.ts";

// Instagram flags accounts that log in in a loop: one attempt per source per window, success or not.
const LOGIN_COOLDOWN_MS = 15 * 60_000;

const inflight = new Map<string, Promise<boolean>>();
const lastAttempt = new Map<string, number>();

const isFile = (file: string) => stat(file).then((s) => s.isFile(), () => false);

export const sessionFile = (ctx: Pick<WorkerContext, "sessionsDir">, sourceId: string) => path.join(ctx.sessionsDir, `${sourceId}.txt`);

async function login(ctx: WorkerContext, sourceId: string): Promise<boolean> {
  const fetcher = getFetcher(sourceId);
  const credentials = ctx.logins[sourceId];
  if (!fetcher.login || !credentials) return false;

  const last = lastAttempt.get(sourceId);
  if (last !== undefined && Date.now() - last < LOGIN_COOLDOWN_MS) return false;
  lastAttempt.set(sourceId, Date.now());

  await mkdir(ctx.tmpDir, { recursive: true });
  const tmpDir = await mkdtemp(path.join(ctx.tmpDir, "login-"));
  try {
    const exported = path.join(tmpDir, "cookies.txt");
    await fetcher.login({ run: ctx.run, tmpDir, credentials }, exported);
    // the sessions dir is a different filesystem than tmp: stage next to the target so the rename is atomic
    await mkdir(ctx.sessionsDir, { recursive: true, mode: 0o700 });
    const target = sessionFile(ctx, sourceId);
    const staged = `${target}.new`;
    await copyFile(exported, staged);
    await chmod(staged, 0o600);
    await rename(staged, target);
    ctx.log.info({ source: sourceId }, "session refreshed");
    await ctx.audit("session.login", { source: sourceId, ok: true });
    return true;
  } catch (error) {
    ctx.log.warn({ source: sourceId, reason: errorMessage(error) }, "session login failed");
    await ctx.audit("session.login", { source: sourceId, ok: false, reason: errorMessage(error) });
    return false;
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

/** Logs in again, coalescing concurrent callers. True only when a fresh session file was written. */
export function refreshSession(ctx: WorkerContext, sourceId: string): Promise<boolean> {
  const running = inflight.get(sourceId);
  if (running) return running;
  const attempt = login(ctx, sourceId).finally(() => inflight.delete(sourceId));
  inflight.set(sourceId, attempt);
  return attempt;
}

/**
 * Cookie file for a job, as a private copy in `tmpDir` (the tools write cookies back on exit and
 * the mounts are not theirs to change). A session from the automatic login wins over the manual
 * `COOKIES_DIR/<id>.txt`; with credentials configured and no session yet, logs in first.
 */
export async function cookiesFor(ctx: WorkerContext, sourceId: string, tmpDir: string): Promise<string | null> {
  if (!(await isFile(sessionFile(ctx, sourceId)))) await refreshSession(ctx, sourceId);
  for (const file of [sessionFile(ctx, sourceId), path.join(ctx.cookiesDir, `${sourceId}.txt`)]) {
    if (!(await isFile(file))) continue;
    const copy = path.join(tmpDir, "cookies.txt");
    await copyFile(file, copy);
    return copy;
  }
  return null;
}
