import { type Database, notifications } from "@magpie/db";
import { type MarkReadBody, type Notification, type NotificationListQuery, type NotificationListResponse, NotificationType } from "@magpie/shared/api";
import { and, count, desc, eq, inArray, isNull, type SQL, sql } from "drizzle-orm";
import type { ServiceDeps } from "../deps.ts";
import { decodeCursor, encodeCursor } from "./cursor.ts";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Db = Database | Tx;

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  payload: Notification["payload"];
}

/** Notifications are best effort: callers pass the transaction they are already in. */
export async function notifyMany(db: Db, inputs: readonly NotificationInput[]): Promise<void> {
  if (inputs.length === 0) return;
  await db.insert(notifications).values(inputs.map((i) => ({ userId: i.userId, type: i.type, payload: i.payload })));
}

export async function listNotifications(deps: ServiceDeps, query: NotificationListQuery): Promise<NotificationListResponse> {
  const conditions: (SQL | undefined)[] = [eq(notifications.userId, deps.userId)];
  if (query.unread) conditions.push(isNull(notifications.readAt));
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  if (cursor?.k === "ks") conditions.push(sql`(${notifications.createdAt}, ${notifications.id}) < (${cursor.s}::timestamptz, ${cursor.i}::uuid)`);

  const rows = await deps.db
    .select({ row: notifications, createdAtText: sql<string>`${notifications.createdAt}::text` })
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(query.limit + 1);
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);

  const [unread] = await deps.db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, deps.userId), isNull(notifications.readAt)));

  const out: Notification[] = [];
  for (const { row } of page) {
    const type = NotificationType.safeParse(row.type);
    // a type from a newer server version is skipped rather than failing the list
    if (!type.success) continue;
    const payload = (typeof row.payload === "object" && row.payload !== null ? row.payload : {}) as Notification["payload"];
    out.push({ id: row.id, type: type.data, payload, read: row.readAt !== null, createdAt: row.createdAt.toISOString() });
  }
  return {
    notifications: out,
    unreadCount: unread?.n ?? 0,
    nextCursor: rows.length > query.limit && last ? encodeCursor({ k: "ks", s: last.createdAtText, i: last.row.id }) : null,
  };
}

export async function markRead(deps: ServiceDeps, body: MarkReadBody): Promise<void> {
  await deps.db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, deps.userId), isNull(notifications.readAt), body.ids ? inArray(notifications.id, body.ids) : undefined));
}
