import { auditLog, type Database } from "@magpie/db";
import { lt } from "drizzle-orm";

export const AUDIT_RETENTION_DAYS = 180;

export async function auditPrune(db: Database, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const deleted = await db.delete(auditLog).where(lt(auditLog.at, cutoff)).returning({ id: auditLog.id });
  return deleted.length;
}
