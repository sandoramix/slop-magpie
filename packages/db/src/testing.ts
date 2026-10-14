// Throwaway databases for integration tests, created on the server of DATABASE_URL (the role
// needs CREATEDB). The database named in the URL itself is never used.
import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { runMigrations } from "./migrate.ts";

export interface TestDatabase {
  url: string;
  drop(): Promise<void>;
}

export async function createTestDatabase(serverUrl: string): Promise<TestDatabase> {
  const name = `magpie_test_${randomBytes(6).toString("hex")}`;
  const admin = postgres(serverUrl, { max: 1, onnotice: () => undefined });
  await admin.unsafe(`create database ${name}`);
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  await runMigrations(url.href);
  return {
    url: url.href,
    async drop() {
      await admin.unsafe(`drop database if exists ${name} with (force)`);
      await admin.end({ timeout: 5 });
    },
  };
}
