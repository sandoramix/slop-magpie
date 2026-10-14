import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.ts";

export interface DbOptions {
  /** Max pool size. The Pi shares Postgres with other services, so keep it small. */
  max?: number;
}

export function createDb(url: string, options: DbOptions = {}) {
  const client = postgres(url, { max: options.max ?? 5, onnotice: () => undefined });
  const db = drizzle({ client, schema, casing: "snake_case" });
  return {
    db,
    ping: async (): Promise<void> => {
      await client`select 1`;
    },
    close: (): Promise<void> => client.end({ timeout: 5 }),
  };
}

export type Database = ReturnType<typeof createDb>["db"];
