import type { Context } from "hono";
import type { AppDeps, AppEnv, ServiceDeps } from "../deps.ts";

/** Service dependencies bound to the library this request works in (the token owner, or the account an admin acts as). */
export function scopeOf(deps: AppDeps, c: Context<AppEnv>): ServiceDeps {
  return {
    db: deps.db,
    store: deps.store,
    jobs: deps.jobs,
    log: deps.log,
    mediaUrlTtlSeconds: deps.mediaUrlTtlSeconds,
    userId: c.get("principal").libraryId,
  };
}
