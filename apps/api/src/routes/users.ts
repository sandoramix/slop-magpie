import {
  CreateUserBody,
  IdParam,
  type MeResponse,
  type PasswordResponse,
  SetPasswordBody,
  UpdateMeBody,
  UpdateUserBody,
  type User,
  type UsersResponse,
} from "@magpie/shared/api";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { AppDeps, AppEnv } from "../deps.ts";
import { errorResponse } from "../http/errors.ts";
import { requestMeta } from "../http/request-meta.ts";
import { validate } from "../http/validate.ts";
import * as credentials from "../services/credentials.ts";
import { getStorage } from "../services/storage.ts";
import * as svc from "../services/users.ts";

export const meRoutes = (deps: AppDeps) =>
  new Hono<AppEnv>()
    .get("/", async (c) => {
      const principal = c.get("principal");
      // quota of the library the request works in, so an admin acting as someone sees that account's numbers
      const storage = await getStorage(deps.db, principal.actingAs?.id ?? principal.id);
      return c.json({ ...svc.whoAmI(principal), storage } satisfies MeResponse, 200);
    })
    // the token owner edits their own display name, even while an admin is acting as someone else
    .patch("/", validate("json", UpdateMeBody), async (c) => {
      const principal = c.get("principal");
      await svc.updateDisplayName(deps.db, principal.id, c.req.valid("json"));
      return c.json(svc.whoAmI({ ...principal, displayName: c.req.valid("json").displayName }) satisfies MeResponse, 200);
    })
    // choosing a password retires the temporary token; the answer carries this device's new session token
    .put("/password", validate("json", SetPasswordBody), async (c) => {
      const principal = c.get("principal");
      const token = await svc.setPassword(deps.db, principal.id, c.req.valid("json").password, c.req.header("user-agent")?.slice(0, 200) ?? null);
      await deps.audit({ action: "auth.password_set", ...requestMeta(c, deps.trustProxy), details: { id: principal.id } });
      const body: PasswordResponse = { token, me: svc.whoAmI({ ...principal, hasPassword: true, actingAs: null }) };
      return c.json(body, 200);
    })
    // signs this device out (a session token is revoked; the temporary token has nothing to revoke)
    .post("/logout", async (c) => {
      const { sessionTokenHash } = c.get("principal");
      if (sessionTokenHash) await credentials.revokeSession(deps.db, sessionTokenHash);
      return c.body(null, 204);
    });

export const adminOnly = createMiddleware<AppEnv>(async (c, next) => {
  // the token owner decides, even while acting as someone else
  if (!c.get("principal").isAdmin) return errorResponse(c, 403, "forbidden", "Admin only");
  await next();
});

/** Account management, admin token only. */
export const usersRoutes = (deps: AppDeps) =>
  new Hono<AppEnv>()
    .use("*", adminOnly)
    .get("/", async (c) => c.json({ users: await svc.listUsers(deps.db) } satisfies UsersResponse, 200))
    .post("/", validate("json", CreateUserBody), async (c) => {
      const { name, role } = c.req.valid("json");
      const created = await svc.createUser(deps.db, name, role);
      await deps.audit({ action: "user.create", ...requestMeta(c, deps.trustProxy), details: { id: created.user.id, name: created.user.name, role } });
      return c.json(created, 201);
    })
    .patch("/:id", validate("param", IdParam), validate("json", UpdateUserBody), async (c) => {
      const { id } = c.req.valid("param");
      const { role, storageLimitBytes } = c.req.valid("json");
      let user: User | undefined;
      if (role !== undefined) {
        user = await svc.setRole(deps.db, id, role, c.get("principal").id);
        await deps.audit({ action: "user.set_role", ...requestMeta(c, deps.trustProxy), details: { id, role } });
      }
      if (storageLimitBytes !== undefined) {
        user = await svc.setStorageLimit(deps.db, id, storageLimitBytes);
        await deps.audit({ action: "user.set_storage_limit", ...requestMeta(c, deps.trustProxy), details: { id, storageLimitBytes } });
      }
      // the schema guarantees one of the two was present
      return c.json(user ?? (await svc.getUser(deps.db, id)), 200);
    })
    .post("/:id/token", validate("param", IdParam), async (c) => {
      const { id } = c.req.valid("param");
      const rotated = await svc.resetCredentials(deps.db, id);
      await deps.audit({ action: "user.reset_credentials", ...requestMeta(c, deps.trustProxy), details: { id } });
      return c.json(rotated, 200);
    })
    .delete("/:id", validate("param", IdParam), async (c) => {
      await svc.deleteUser(deps, c.req.valid("param").id, c.get("principal").id, requestMeta(c, deps.trustProxy));
      return c.body(null, 204);
    });
