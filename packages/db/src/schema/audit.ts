import { index, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { id, inet, timestamptz } from "./columns.ts";

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    at: timestamptz().notNull().defaultNow(),
    action: text().notNull(),
    ip: inet(),
    userAgent: text(),
    // never secrets, tokens, cookies or signed URLs
    details: jsonb().$type<Record<string, unknown>>(),
  },
  (t) => [index("audit_log_at_idx").on(t.at)],
);
