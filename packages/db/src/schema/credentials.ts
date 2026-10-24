import { pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { timestamptz } from "./columns.ts";

/**
 * Server-wide login material per source, managed by an admin from the app (no `user_id`: it belongs to the
 * deployment, not to a library). `kind` is `session` (base64 of the tool's session file), `cookies`
 * (Netscape cookies.txt) or `state` (the worker's last session verdict, `ok` / `dead`). Never logged or audited.
 */
export const sourceCredentials = pgTable(
  "source_credentials",
  {
    source: text().notNull(),
    kind: text().notNull(),
    content: text().notNull(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.source, t.kind] })],
);
