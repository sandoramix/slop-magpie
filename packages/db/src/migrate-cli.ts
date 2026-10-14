import { env } from "./env.ts";
import { runMigrations } from "./migrate.ts";

await runMigrations(env.DATABASE_URL);
console.log("migrations applied");
