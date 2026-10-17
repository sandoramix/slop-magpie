import { type Database, users } from "@magpie/db";
import type { Storage } from "@magpie/shared/api";
import { eq, type SQL, sql } from "drizzle-orm";
import { ApiError } from "../http/errors.ts";

/**
 * Bytes of original media an account stores. Thumbnails are small and not counted.
 * Written with explicit aliases: Drizzle drops table qualifiers inside a subquery, which makes plain "id" ambiguous.
 */
export const usedBytesSql = (owner: SQL | string) =>
  sql<number>`coalesce((select sum(m.bytes) from media m join items i on i.id = m.item_id where i.user_id = ${owner}), 0)::float8`;

/** The outer users row, for use inside a users query. */
export const usersIdSql = sql`"users"."id"`;

export async function getStorage(db: Database, userId: string): Promise<Storage> {
  const [row] = await db.select({ limitBytes: users.storageLimitBytes, usedBytes: usedBytesSql(userId) }).from(users).where(eq(users.id, userId));
  if (!row) throw new ApiError(404, "not_found", "Account not found");
  return { usedBytes: row.usedBytes, limitBytes: row.limitBytes };
}

export const formatGb = (bytes: number): string => `${(bytes / 1024 ** 3).toFixed(1)} GB`;

/** New saves are refused once the library is full; downloads that would overflow are stopped by the worker. */
export async function assertHasRoom(db: Database, userId: string): Promise<void> {
  const { usedBytes, limitBytes } = await getStorage(db, userId);
  if (limitBytes !== null && usedBytes >= limitBytes) {
    throw new ApiError(403, "forbidden", `Storage limit reached (${formatGb(usedBytes)} of ${formatGb(limitBytes)}). Delete items or ask the admin to raise the limit.`);
  }
}
