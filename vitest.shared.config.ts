// Shared by each package's vitest.config.ts.
// Integration tests use the server in DATABASE_URL (from the environment or the root .env). They
// never touch that database: each test file creates a temporary database next to it and drops it
// afterwards, so the role needs CREATEDB. Without DATABASE_URL they are skipped.
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

const envFile = new URL(".env", import.meta.url);
const fileEnv = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};

export default defineConfig({
  test: {
    provide: { databaseUrl: process.env.DATABASE_URL ?? fileEnv.DATABASE_URL ?? "" },
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
