import { type Database, sourceCredentials } from "@magpie/db";
import type { CredentialKind, CredentialsStatus } from "@magpie/shared/api";
import { and, eq } from "drizzle-orm";
import { ApiError } from "../http/errors.ts";

/** Strict enough to catch a wrong file: a cookies.txt names the session cookie, a session file is base64 and not tiny. */
export function assertCredential(kind: CredentialKind, content: string): void {
  if (kind === "cookies") {
    if (!/\bsessionid\b/.test(content)) throw new ApiError(400, "bad_request", "These cookies have no sessionid; export them while logged in");
    return;
  }
  if (!/^[A-Za-z0-9+/=\s]+$/.test(content) || content.length < 40) throw new ApiError(400, "bad_request", "The session must be the instaloader session file, base64 encoded");
}

export async function setCredential(db: Database, source: string, kind: CredentialKind, content: string): Promise<void> {
  assertCredential(kind, content);
  const row = { source, kind, content: content.trim(), updatedAt: new Date() };
  await db
    .insert(sourceCredentials)
    .values(row)
    .onConflictDoUpdate({ target: [sourceCredentials.source, sourceCredentials.kind], set: { content: row.content, updatedAt: row.updatedAt } });
  // the old verdict is about the old credentials
  await db.delete(sourceCredentials).where(and(eq(sourceCredentials.source, source), eq(sourceCredentials.kind, "state")));
}

export async function deleteCredential(db: Database, source: string, kind: CredentialKind): Promise<void> {
  await db.delete(sourceCredentials).where(and(eq(sourceCredentials.source, source), eq(sourceCredentials.kind, kind)));
}

export async function credentialsStatus(db: Database, source: string): Promise<CredentialsStatus> {
  const rows = await db
    .select({ kind: sourceCredentials.kind, content: sourceCredentials.content, updatedAt: sourceCredentials.updatedAt })
    .from(sourceCredentials)
    .where(eq(sourceCredentials.source, source));
  const at = (kind: string) => {
    const row = rows.find((r) => r.kind === kind);
    return row ? { updatedAt: row.updatedAt.toISOString() } : null;
  };
  const state = rows.find((r) => r.kind === "state");
  return {
    source,
    session: at("session"),
    cookies: at("cookies"),
    state: state && (state.content === "ok" || state.content === "dead") ? { value: state.content, checkedAt: state.updatedAt.toISOString() } : null,
  };
}
