import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { sourceCredentials } from "@magpie/db";
import { eq } from "drizzle-orm";
import type { WorkerContext } from "./context.ts";

const mtime = (file: string) => stat(file).then((s) => s.mtimeMs, () => 0);

/** Where the cookies uploaded from the app live. `COOKIES_DIR` is mounted read-only, so they get their own file. */
export const uploadedCookiesFile = (ctx: WorkerContext, sourceId: string) => path.join(ctx.sessionsDir, `${sourceId}.cookies.txt`);

/**
 * Credentials uploaded from the app live in the database; the tools need files. A file is rewritten only when the
 * upload is newer than it, so a session the tool renewed itself (newer mtime) is never overwritten by an old upload.
 */
export async function syncCredentials(ctx: WorkerContext, sourceId: string): Promise<void> {
  const rows = await ctx.db.select().from(sourceCredentials).where(eq(sourceCredentials.source, sourceId));
  await mkdir(ctx.sessionsDir, { recursive: true, mode: 0o700 });

  const session = rows.find((r) => r.kind === "session");
  const sessionFile = path.join(ctx.sessionsDir, `${sourceId}.session`);
  if (session && session.updatedAt.getTime() > (await mtime(sessionFile))) {
    await writeFile(sessionFile, Buffer.from(session.content, "base64"), { mode: 0o600 });
    ctx.log.info({ source: sourceId }, "session file replaced by the one uploaded from the app");
  }

  const cookies = rows.find((r) => r.kind === "cookies");
  const cookiesFile = uploadedCookiesFile(ctx, sourceId);
  if (!cookies) await rm(cookiesFile, { force: true });
  else if (cookies.updatedAt.getTime() > (await mtime(cookiesFile))) {
    await writeFile(cookiesFile, `${cookies.content}\n`, { mode: 0o600 });
    ctx.log.info({ source: sourceId }, "cookies replaced by the ones uploaded from the app");
  }
}

/** Mirrors the session verdict into the database so the app can show it. */
export async function publishSessionState(ctx: WorkerContext, sourceId: string, state: "ok" | "dead"): Promise<void> {
  const now = new Date();
  await ctx.db
    .insert(sourceCredentials)
    .values({ source: sourceId, kind: "state", content: state, updatedAt: now })
    .onConflictDoUpdate({ target: [sourceCredentials.source, sourceCredentials.kind], set: { content: state, updatedAt: now } });
}
