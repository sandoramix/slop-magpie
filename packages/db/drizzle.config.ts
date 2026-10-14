import { defineConfig } from "drizzle-kit";

// `generate` works offline; DATABASE_URL is only needed for drizzle-kit commands that connect.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
