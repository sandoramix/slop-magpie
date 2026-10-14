import { customType, timestamp, uuid } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

/** UUIDv7 primary key, generated in app code (time-sortable). */
export const id = () => uuid().primaryKey().$defaultFn(() => uuidv7());

export const timestamptz = () => timestamp({ withTimezone: true, mode: "date" });

export const createdAt = () => timestamptz().notNull().defaultNow();

export const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const inet = customType<{ data: string }>({ dataType: () => "inet" });
