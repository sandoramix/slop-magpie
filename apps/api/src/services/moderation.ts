// Reports from users and the admin's tools to act on them. Hiding an item keeps it with its owner but
// removes it from every public view; suspending an account signs it out and hides it and its posts.
import { ADMIN_USER_ID, type Database, items, reports, sessions, users } from "@magpie/db";
import type { CreateReportBody, Report, ReportListQuery, ReportListResponse, ResolveReportBody } from "@magpie/shared/api";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { ServiceDeps } from "../deps.ts";
import { ApiError } from "../http/errors.ts";
import { decodeCursor, encodeCursor } from "./cursor.ts";
import { assertVisible } from "./posts.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_REPORTS_PER_DAY = 20;

export async function createReport(deps: ServiceDeps, body: CreateReportBody): Promise<void> {
  const [recent] = await deps.db
    .select({ n: count() })
    .from(reports)
    .where(and(eq(reports.reporterId, deps.userId), gte(reports.createdAt, new Date(Date.now() - DAY_MS))));
  if ((recent?.n ?? 0) >= MAX_REPORTS_PER_DAY) throw new ApiError(429, "rate_limited", "Too many reports today");

  let itemId: string | null = null;
  let targetUserId: string | null = null;
  if (body.target === "item") {
    if (!z.uuid().safeParse(body.targetId).success) throw new ApiError(400, "bad_request", "Invalid item id");
    await assertVisible(deps.db, deps.userId, body.targetId);
    itemId = body.targetId;
  } else {
    const [row] = await deps.db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.name}) = ${body.targetId.toLowerCase()}`);
    if (!row) throw new ApiError(404, "not_found", "Person not found");
    if (row.id === deps.userId) throw new ApiError(400, "bad_request", "You cannot report yourself");
    targetUserId = row.id;
  }
  const [open] = await deps.db
    .select({ id: reports.id })
    .from(reports)
    .where(
      and(
        eq(reports.reporterId, deps.userId),
        eq(reports.status, "open"),
        itemId ? eq(reports.itemId, itemId) : targetUserId ? eq(reports.targetUserId, targetUserId) : undefined,
      ),
    );
  if (open) return;
  await deps.db.insert(reports).values({ reporterId: deps.userId, target: body.target, itemId, targetUserId, reason: body.reason });
}

export async function listReports(db: Database, query: ReportListQuery): Promise<ReportListResponse> {
  const reporter = alias(users, "reporter");
  const target = alias(users, "target_user");
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  const rows = await db
    .select({
      id: reports.id,
      target: reports.target,
      itemId: reports.itemId,
      itemTitle: items.title,
      targetUser: target.name,
      reporter: reporter.name,
      reason: reports.reason,
      status: reports.status,
      createdAt: reports.createdAt,
      createdAtText: sql<string>`${reports.createdAt}::text`,
    })
    .from(reports)
    .innerJoin(reporter, eq(reporter.id, reports.reporterId))
    .leftJoin(items, eq(items.id, reports.itemId))
    .leftJoin(target, eq(target.id, reports.targetUserId))
    .where(
      and(
        eq(reports.status, query.status),
        cursor?.k === "ks" ? sql`(${reports.createdAt}, ${reports.id}) < (${cursor.s}::timestamptz, ${cursor.i}::uuid)` : undefined,
      ),
    )
    .orderBy(desc(reports.createdAt), desc(reports.id))
    .limit(query.limit + 1);
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  const out: Report[] = page.map((r) => ({
    id: r.id,
    target: r.target,
    itemId: r.itemId,
    itemTitle: r.itemTitle,
    targetUser: r.targetUser,
    reporter: r.reporter,
    reason: r.reason,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }));
  return { reports: out, nextCursor: rows.length > query.limit && last ? encodeCursor({ k: "ks", s: last.createdAtText, i: last.id }) : null };
}

export async function resolveReport(db: Database, id: string, body: ResolveReportBody): Promise<void> {
  await db.transaction(async (tx) => {
    const [report] = await tx.select().from(reports).where(eq(reports.id, id)).for("update");
    if (!report) throw new ApiError(404, "not_found", "Report not found");
    if (body.action === "hide") {
      if (!report.itemId) throw new ApiError(400, "bad_request", "This report is not about an item");
      await tx.update(items).set({ hiddenAt: new Date() }).where(eq(items.id, report.itemId));
    } else if (body.action === "suspend") {
      const userId = report.targetUserId ?? (report.itemId ? (await tx.select({ u: items.userId }).from(items).where(eq(items.id, report.itemId)))[0]?.u : undefined);
      if (!userId) throw new ApiError(400, "bad_request", "Nobody to suspend");
      await suspend(tx, userId, true);
    }
    await tx
      .update(reports)
      .set({ status: body.action === "dismiss" ? "dismissed" : "actioned", resolvedAt: new Date() })
      .where(eq(reports.id, id));
  });
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function suspend(db: Database | Tx, userId: string, on: boolean): Promise<void> {
  if (userId === ADMIN_USER_ID) throw new ApiError(400, "bad_request", "The root admin cannot be suspended");
  const [target] = await db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, userId));
  if (!target) throw new ApiError(404, "not_found", "Account not found");
  if (target.isAdmin && on) throw new ApiError(400, "bad_request", "Demote the admin before suspending");
  await db.update(users).set({ suspendedAt: on ? new Date() : null }).where(eq(users.id, userId));
  if (on) await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function setHidden(db: Database, itemId: string, hidden: boolean): Promise<void> {
  const rows = await db.update(items).set({ hiddenAt: hidden ? new Date() : null }).where(eq(items.id, itemId)).returning({ id: items.id });
  if (rows.length === 0) throw new ApiError(404, "not_found", "Item not found");
}
