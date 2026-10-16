import { items } from "@magpie/db";
import type {
  CreateItemResponse,
  CreateUserResponse,
  Folder,
  ItemListResponse,
  LoginResponse,
  MeResponse,
  PasswordResponse,
  Role,
  User,
  StatsResponse,
  Tag,
  UsersResponse,
} from "@magpie/shared/api";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { type IntegrationEnv, integrationEnv } from "./testing.ts";

const serverUrl = inject("databaseUrl");

describe.skipIf(!serverUrl)("accounts (integration)", () => {
  let env: IntegrationEnv;

  beforeAll(async () => {
    env = await integrationEnv(serverUrl);
  });
  afterAll(async () => {
    await env.close();
  });

  const json = async <T>(res: Response | Promise<Response>, status: number): Promise<T> => {
    const r = await res;
    const body: unknown = r.status === 204 ? null : await r.json();
    expect(r.status, JSON.stringify(body)).toBe(status);
    return body as T;
  };

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const createUser = (name: string, role?: Role) =>
    json<CreateUserResponse>(env.request("/users", { method: "POST", json: { name, ...(role ? { role } : {}) } }), 201);
  const asUser = (token: string, path: string, init: RequestInit & { json?: unknown } = {}) =>
    env.request(path, { ...init, headers: { ...bearer(token), ...(init.headers as Record<string, string> | undefined) } });
  const save = (token: string, url: string, extra: Record<string, unknown> = {}) =>
    asUser(token, "/items", { method: "POST", json: { url, ...extra } });

  it("lets the admin create accounts whose tokens work and are shown once", async () => {
    const created = await createUser("Alice");
    expect(created.token).toMatch(/^mgp_/);
    expect(created.user).toMatchObject({ name: "Alice", isAdmin: false, itemCount: 0 });

    const me = await json<MeResponse>(asUser(created.token, "/me"), 200);
    expect(me).toMatchObject({ id: created.user.id, name: "Alice", isAdmin: false, actingAs: null });
    const admin = await json<MeResponse>(env.request("/me"), 200);
    expect(admin).toMatchObject({ isAdmin: true, actingAs: null });

    const list = await json<UsersResponse>(env.request("/users"), 200);
    expect(list.users.map((u) => u.name)).toEqual(expect.arrayContaining(["Admin", "Alice"]));
    expect(JSON.stringify(list)).not.toContain(created.token);

    expect((await env.request("/users", { method: "POST", json: { name: "alice" } })).status).toBe(409);
  });

  it("lets people change their display name but never their username", async () => {
    const created = await createUser("Fixed Name");
    expect(created.user.displayName).toBeNull();

    const me = await json<MeResponse>(asUser(created.token, "/me", { method: "PATCH", json: { displayName: "Sunny" } }), 200);
    expect(me).toMatchObject({ name: "Fixed Name", displayName: "Sunny" });
    expect(await json<MeResponse>(asUser(created.token, "/me"), 200)).toMatchObject({ name: "Fixed Name", displayName: "Sunny" });
    const listed = await json<UsersResponse>(env.request("/users"), 200);
    expect(listed.users.find((u) => u.id === created.user.id)).toMatchObject({ name: "Fixed Name", displayName: "Sunny" });

    // the username is not part of the contract: extra keys are ignored, and there is no rename route
    await json<MeResponse>(asUser(created.token, "/me", { method: "PATCH", json: { displayName: null, name: "Hacked" } }), 200);
    expect(await json<MeResponse>(asUser(created.token, "/me"), 200)).toMatchObject({ name: "Fixed Name", displayName: null });
    // the admin can change a role but there is no way to rename an account
    expect((await env.request(`/users/${created.user.id}`, { method: "PATCH", json: { name: "Other" } })).status).toBe(400);
    const after = await json<UsersResponse>(env.request("/users"), 200);
    expect(after.users.find((u) => u.id === created.user.id)?.name).toBe("Fixed Name");
  });

  it("keeps libraries isolated", async () => {
    const a = await createUser("Iso A");
    const b = await createUser("Iso B");

    const saved = await json<CreateItemResponse>(save(a.token, "https://example.com/private-a"), 202);
    const folderA = await json<Folder>(asUser(a.token, "/folders", { method: "POST", json: { name: "Recipes" } }), 201);
    const tagA = await json<Tag>(asUser(a.token, "/tags", { method: "POST", json: { name: "secret" } }), 201);

    // B sees nothing of A's
    expect((await json<ItemListResponse>(asUser(b.token, "/items"), 200)).items).toEqual([]);
    expect((await asUser(b.token, `/items/${saved.item.id}`)).status).toBe(404);
    expect((await asUser(b.token, `/items/${saved.item.id}`, { method: "PATCH", json: { favorite: true } })).status).toBe(404);
    expect((await asUser(b.token, `/items/${saved.item.id}`, { method: "DELETE" })).status).toBe(404);
    expect((await json<{ folders: Folder[] }>(asUser(b.token, "/folders"), 200)).folders).toEqual([]);
    expect((await json<{ tags: Tag[] }>(asUser(b.token, "/tags"), 200)).tags).toEqual([]);
    expect((await json<StatsResponse>(asUser(b.token, "/stats"), 200)).total).toBe(0);
    expect((await json<StatsResponse>(asUser(a.token, "/stats"), 200)).total).toBe(1);

    // B cannot file its own item into A's folder or tag
    const own = await json<CreateItemResponse>(save(b.token, "https://example.com/own-b"), 202);
    expect((await save(b.token, "https://example.com/own-b2", { folderIds: [folderA.id] })).status).toBe(400);
    expect((await asUser(b.token, `/items/${own.item.id}/tags`, { method: "PUT", json: { tagIds: [tagA.id] } })).status).toBe(400);
    expect((await asUser(b.token, `/folders/${folderA.id}`, { method: "DELETE" })).status).toBe(404);
    expect(
      (await asUser(b.token, "/items/bulk", { method: "POST", json: { ids: [saved.item.id], op: "delete" } }).then((r) => r.json())) as { affected: number },
    ).toEqual({ affected: 0 });

    // A's item is untouched
    expect((await json<ItemListResponse>(asUser(a.token, "/items"), 200)).items.map((i) => i.id)).toEqual([saved.item.id]);
  });

  it("allows the same post, folder and tag names in different accounts", async () => {
    const a = await createUser("Dup A");
    const b = await createUser("Dup B");
    const url = "https://www.instagram.com/reel/SameReel01/";
    const first = await json<CreateItemResponse>(save(a.token, url), 202);
    const second = await json<CreateItemResponse>(save(b.token, url), 202);
    expect(second.duplicate).toBe(false);
    expect(second.item.id).not.toBe(first.item.id);
    for (const t of [a.token, b.token]) {
      await json<Folder>(asUser(t, "/folders", { method: "POST", json: { name: "Same" } }), 201);
      await json<Tag>(asUser(t, "/tags", { method: "POST", json: { name: "same" } }), 201);
    }
  });

  it("limits account management to the admin token", async () => {
    const user = await createUser("Plain");
    expect((await asUser(user.token, "/users")).status).toBe(403);
    expect((await asUser(user.token, "/users", { method: "POST", json: { name: "x" } })).status).toBe(403);
    expect((await asUser(user.token, "/me", { headers: { "X-Magpie-Act-As": user.user.id } })).status).toBe(403);
  });

  it("lets the admin act inside an account and audits writes", async () => {
    const user = await createUser("Impersonated");
    const saved = await json<CreateItemResponse>(save(user.token, "https://example.com/act-as"), 202);
    const as = { "X-Magpie-Act-As": user.user.id };

    const me = await json<MeResponse>(env.request("/me", { headers: as }), 200);
    expect(me).toMatchObject({ isAdmin: true, actingAs: { id: user.user.id, name: "Impersonated" } });

    const list = await json<ItemListResponse>(env.request("/items", { headers: as }), 200);
    expect(list.items.map((i) => i.id)).toEqual([saved.item.id]);
    // without the header the admin sees only its own library
    expect((await json<ItemListResponse>(env.request("/items"), 200)).items.map((i) => i.id)).not.toContain(saved.item.id);

    const patched = await json<{ favorite: boolean }>(env.request(`/items/${saved.item.id}`, { method: "PATCH", headers: as, json: { favorite: true } }), 200);
    expect(patched.favorite).toBe(true);

    expect((await env.request("/items", { headers: { "X-Magpie-Act-As": "00000000-0000-4000-8000-00000000dead" } })).status).toBe(404);
    expect((await env.request("/items", { headers: { "X-Magpie-Act-As": "nope" } })).status).toBe(404);
  });

  describe("passwords", () => {
    // every call comes from its own address, so only the per-username limit can trip in these tests
    let nextIp = 1;
    const login = (username: string, password: string, ip = `10.1.${Math.floor(nextIp / 250)}.${nextIp++ % 250}`) =>
      env.request("/auth/login", { method: "POST", headers: { Authorization: "", "X-Forwarded-For": ip }, json: { username, password } });
    const setPassword = (token: string, password: string) => asUser(token, "/me/password", { method: "PUT", json: { password } });

    it("retires the temporary token once a password is set and signs in with it afterwards", async () => {
      const created = await createUser("Pw User");
      expect((await login("Pw User", "whatever-long")).status).toBe(401);
      expect((await setPassword(created.token, "short")).status).toBe(400);

      const set = await json<PasswordResponse & { token: string }>(setPassword(created.token, "correct horse battery"), 200);
      expect(set.me).toMatchObject({ name: "Pw User", hasPassword: true });
      expect(set.token).toMatch(/^mgs_/);
      // the generated token was temporary
      expect((await asUser(created.token, "/me")).status).toBe(401);
      expect((await asUser(set.token, "/me")).status).toBe(200);

      // another device signs in with username + password (case-insensitive username)
      const again = await json<LoginResponse>(login("pw user", "correct horse battery"), 200);
      expect(again.token).not.toBe(set.token);
      expect((await asUser(again.token, "/items")).status).toBe(200);
      expect((await login("Pw User", "wrong password!")).status).toBe(401);
      expect((await login("Nobody Here", "correct horse battery")).status).toBe(401);

      // logging out revokes that device only
      expect((await asUser(again.token, "/me/logout", { method: "POST" })).status).toBe(204);
      expect((await asUser(again.token, "/me")).status).toBe(401);
      expect((await asUser(set.token, "/me")).status).toBe(200);
    });

    it("changing the password signs out the other devices", async () => {
      const created = await createUser("Pw Change");
      const first = await json<PasswordResponse & { token: string }>(setPassword(created.token, "first password here"), 200);
      const other = await json<LoginResponse>(login("Pw Change", "first password here"), 200);
      const changed = await json<PasswordResponse & { token: string }>(setPassword(first.token, "second password here"), 200);
      expect((await asUser(first.token, "/me")).status).toBe(401);
      expect((await asUser(other.token, "/me")).status).toBe(401);
      expect((await asUser(changed.token, "/me")).status).toBe(200);
      expect((await login("Pw Change", "first password here")).status).toBe(401);
    });

    it("lets the admin reset an account: new temporary token, no password, no sessions", async () => {
      const created = await createUser("Forgetful");
      const set = await json<PasswordResponse & { token: string }>(setPassword(created.token, "i will forget this"), 200);
      const reset = await json<{ token: string }>(env.request(`/users/${created.user.id}/token`, { method: "POST" }), 200);
      expect((await asUser(set.token, "/me")).status).toBe(401);
      expect((await login("Forgetful", "i will forget this")).status).toBe(401);
      const me = await json<MeResponse>(asUser(reset.token, "/me"), 200);
      expect(me.hasPassword).toBe(false);
    });

    it("lets the root admin add a password while API_TOKEN keeps working", async () => {
      const set = await json<PasswordResponse>(env.request("/me/password", { method: "PUT", json: { password: "admin long password" } }), 200);
      // no session is issued: the admin keeps using its token
      expect(set.token).toBeNull();
      expect(set.me).toMatchObject({ isAdmin: true, hasPassword: true });
      expect((await env.request("/me")).status).toBe(200);
      const viaPassword = await json<LoginResponse>(login("Admin", "admin long password"), 200);
      expect((await asUser(viaPassword.token, "/users")).status).toBe(200);
    });

    it("rate limits password guessing per username", async () => {
      await createUser("Guarded");
      for (let i = 0; i < 10; i++) expect((await login("Guarded", `wrong password ${i}`)).status).toBe(401);
      expect((await login("Guarded", "one more try")).status).toBe(429);
    });
  });

  describe("roles", () => {
    it("assigns a role at creation, defaulting to user", async () => {
      expect((await createUser("Role Default")).user.isAdmin).toBe(false);
      expect((await createUser("Role Admin", "admin")).user.isAdmin).toBe(true);
      expect((await env.request("/users", { method: "POST", json: { name: "Role Bad", role: "root" } })).status).toBe(400);
    });

    it("gives an admin account the admin powers, and a user none", async () => {
      const admin = await createUser("Second Admin", "admin");
      const user = await createUser("Regular", "user");
      expect(await json<MeResponse>(asUser(admin.token, "/me"), 200)).toMatchObject({ isAdmin: true });
      expect((await asUser(admin.token, "/users")).status).toBe(200);
      const made = await json<CreateUserResponse>(asUser(admin.token, "/users", { method: "POST", json: { name: "By Second" } }), 201);
      expect(made.user.isAdmin).toBe(false);
      // an admin account can act inside a user's library
      const act = await asUser(admin.token, "/me", { headers: { "X-Magpie-Act-As": user.user.id } });
      expect(await json<MeResponse>(act, 200)).toMatchObject({ isAdmin: true, actingAs: { id: user.user.id } });
      expect((await asUser(user.token, "/users")).status).toBe(403);
    });

    it("keeps the admin role after the account swaps its token for a password session", async () => {
      const admin = await createUser("Admin With Password", "admin");
      const set = await json<PasswordResponse & { token: string }>(asUser(admin.token, "/me/password", { method: "PUT", json: { password: "second admin password" } }), 200);
      expect((await asUser(admin.token, "/me")).status).toBe(401);
      expect((await asUser(set.token, "/users")).status).toBe(200);
    });

    it("promotes and demotes, never the root admin or yourself", async () => {
      const user = await createUser("Promotable");
      expect((await asUser(user.token, "/users")).status).toBe(403);
      const promoted = await json<User>(env.request(`/users/${user.user.id}`, { method: "PATCH", json: { role: "admin" } }), 200);
      expect(promoted.isAdmin).toBe(true);
      expect((await asUser(user.token, "/users")).status).toBe(200);
      // takes effect at once: the role is read on every request
      await json<User>(env.request(`/users/${user.user.id}`, { method: "PATCH", json: { role: "user" } }), 200);
      expect((await asUser(user.token, "/users")).status).toBe(403);

      const { users } = await json<UsersResponse>(env.request("/users"), 200);
      const root = users.find((u) => u.name === "Admin");
      expect((await env.request(`/users/${root?.id ?? ""}`, { method: "PATCH", json: { role: "user" } })).status).toBe(400);
      const other = await createUser("Self Admin", "admin");
      expect((await asUser(other.token, `/users/${other.user.id}`, { method: "PATCH", json: { role: "user" } })).status).toBe(400);
      expect((await asUser(other.token, `/users/${other.user.id}`, { method: "DELETE" })).status).toBe(400);
      expect((await asUser(user.token, `/users/${user.user.id}`, { method: "PATCH", json: { role: "admin" } })).status).toBe(403);
    });
  });

  it("rotates a token and rejects the old one", async () => {
    const user = await createUser("Rotating");
    const rotated = await json<{ token: string }>(env.request(`/users/${user.user.id}/token`, { method: "POST" }), 200);
    expect(rotated.token).not.toBe(user.token);
    expect((await asUser(user.token, "/me")).status).toBe(401);
    expect((await asUser(rotated.token, "/me")).status).toBe(200);
  });

  it("deletes an account with its library and queues the files for deletion", async () => {
    const user = await createUser("Leaving");
    const saved = await json<CreateItemResponse>(save(user.token, "https://example.com/leaving"), 202);
    await json<Folder>(asUser(user.token, "/folders", { method: "POST", json: { name: "Gone soon" } }), 201);
    env.jobs.sent.length = 0;

    await json(env.request(`/users/${user.user.id}`, { method: "DELETE" }), 204);
    expect((await asUser(user.token, "/me")).status).toBe(401);
    expect(await env.deps.db.select().from(items).where(eq(items.id, saved.item.id))).toEqual([]);
    expect(env.jobs.sent).toEqual([{ queue: "blobDelete", data: { itemId: saved.item.id } }]);
    expect((await json<UsersResponse>(env.request("/users"), 200)).users.map((u) => u.name)).not.toContain("Leaving");
  });

  it("protects the admin account", async () => {
    const { users } = await json<UsersResponse>(env.request("/users"), 200);
    const admin = users.find((u) => u.isAdmin);
    expect(admin).toBeDefined();
    expect((await env.request(`/users/${admin?.id ?? ""}`, { method: "DELETE" })).status).toBe(400);
    expect((await env.request(`/users/${admin?.id ?? ""}/token`, { method: "POST" })).status).toBe(400);
  });
});
