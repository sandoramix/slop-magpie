import { itemFolderRejections, itemFolders, itemKeywords, items } from "@magpie/db";
import type {
  AutoFiledActionResponse,
  AutoFiledResponse,
  CreateItemResponse,
  CreateUserResponse,
  HiddenItemsResponse,
  StopTermsResponse,
  SuspendedAccountsResponse,
  TopicsResponse,
} from "@magpie/shared/api";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { type IntegrationEnv, integrationEnv } from "./testing.ts";

const serverUrl = inject("databaseUrl");

describe.skipIf(!serverUrl)("stop terms, topics, auto-filing review (integration)", () => {
  let env: IntegrationEnv;
  let alice: CreateUserResponse;

  const json = async <T>(res: Response | Promise<Response>, status: number): Promise<T> => {
    const r = await res;
    const body: unknown = r.status === 204 ? null : await r.json();
    expect(r.status, JSON.stringify(body)).toBe(status);
    return body as T;
  };
  const as = (path: string, init: RequestInit & { json?: unknown } = {}) =>
    env.request(path, { ...init, headers: { Authorization: `Bearer ${alice.token}`, ...(init.headers as Record<string, string> | undefined) } });

  const newItem = async (url: string): Promise<string> => {
    const created = await json<CreateItemResponse>(as("/items", { method: "POST", json: { url } }), 202);
    await env.deps.db.update(items).set({ fetchStatus: "ready" }).where(eq(items.id, created.item.id));
    return created.item.id;
  };

  beforeAll(async () => {
    env = await integrationEnv(serverUrl);
    alice = await json<CreateUserResponse>(env.request("/users", { method: "POST", json: { name: "alice" } }), 201);
  });
  afterAll(async () => {
    await env.close();
  });

  it("stop terms remove matching automatic keywords at once and keep manual ones", async () => {
    const id = await newItem("https://example.com/stop");
    await env.deps.db.insert(itemKeywords).values([
      { itemId: id, keyword: "recipe", source: "hashtag", weight: 1 },
      { itemId: id, keyword: "slow recipe", source: "caption", weight: 0.5 },
      { itemId: id, keyword: "recipes", source: "caption", weight: 0.5 },
      { itemId: id, keyword: "pasta", source: "caption", weight: 0.5 },
      { itemId: id, keyword: "recipe", source: "manual", weight: 1 },
    ]);

    const added = await json<StopTermsResponse>(as("/stop-terms", { method: "POST", json: { term: "#Recipe" } }), 201);
    expect(added.terms).toEqual(["recipe"]);
    const left = await env.deps.db.select({ k: itemKeywords.keyword, s: itemKeywords.source }).from(itemKeywords).where(eq(itemKeywords.itemId, id));
    expect(left.map((r) => `${r.s}:${r.k}`).sort()).toEqual(["caption:pasta", "caption:recipes", "manual:recipe"]);

    expect((await as("/stop-terms", { method: "POST", json: { term: "x" } })).status).toBe(400);
    expect((await json<StopTermsResponse>(as("/stop-terms/recipe", { method: "DELETE" }), 200)).terms).toEqual([]);
  });

  it("finds topics from embeddings and says how much was analysed", async () => {
    const baking = [1, 0.1, 0];
    const travel = [0, 0.1, 1];
    const ids: string[] = [];
    for (const [i, vec] of [baking, baking, baking, baking, travel, travel, travel].entries()) {
      const id = await newItem(`https://example.com/topic-${i}`);
      ids.push(id);
      await env.deps.db.update(items).set({ embedding: vec }).where(eq(items.id, id));
      await env.deps.db.insert(itemKeywords).values({ itemId: id, keyword: i < 4 ? "bread" : "trip", source: "caption", weight: 1 });
    }
    // one bread item is already filed
    const folder = await json<{ id: string }>(as("/folders", { method: "POST", json: { name: "Baking" } }), 201);
    await env.deps.db.insert(itemFolders).values({ itemId: ids[0] ?? "", folderId: folder.id, assignedBy: "manual" });

    const res = await json<TopicsResponse>(as("/topics"), 200);
    expect(res.analysed).toBeGreaterThanOrEqual(7);
    const bread = res.topics.find((t) => t.keywords.includes("bread"));
    expect(bread).toMatchObject({ size: 4, unfiledCount: 3 });
    expect(res.topics.find((t) => t.keywords.includes("trip"))).toMatchObject({ size: 3, unfiledCount: 3 });

    const onlyUnfiled = await json<TopicsResponse>(as("/topics?unfiled=true"), 200);
    expect(onlyUnfiled.topics.length).toBe(2);
  });

  it("lets the person keep or undo what was filed automatically, and remembers the undo", async () => {
    const keepMe = await newItem("https://example.com/auto-keep");
    const undoMe = await newItem("https://example.com/auto-undo");
    const folder = await json<{ id: string }>(as("/folders", { method: "POST", json: { name: "Auto" } }), 201);
    await env.deps.db.insert(itemFolders).values([
      { itemId: keepMe, folderId: folder.id, assignedBy: "auto", confidence: 0.9 },
      { itemId: undoMe, folderId: folder.id, assignedBy: "auto", confidence: 0.9 },
    ]);

    const pending = await json<AutoFiledResponse>(as("/auto-filed"), 200);
    expect(pending.entries.map((e) => e.itemId).sort()).toEqual([keepMe, undoMe].sort());
    expect(pending.entries[0]?.folders[0]?.name).toBe("Auto");

    expect(await json<AutoFiledActionResponse>(as("/auto-filed/keep", { method: "POST", json: { itemIds: [keepMe] } }), 200)).toEqual({ affected: 1 });
    const kept = await env.deps.db.select({ by: itemFolders.assignedBy }).from(itemFolders).where(eq(itemFolders.itemId, keepMe));
    expect(kept[0]?.by).toBe("manual");

    expect(await json<AutoFiledActionResponse>(as("/auto-filed/undo", { method: "POST", json: {} }), 200)).toEqual({ affected: 1 });
    expect(await env.deps.db.select().from(itemFolders).where(eq(itemFolders.itemId, undoMe))).toHaveLength(0);
    expect(await env.deps.db.select().from(itemFolderRejections).where(eq(itemFolderRejections.itemId, undoMe))).toHaveLength(1);
    // nothing left to review, and a manually kept filing is never touched
    expect((await json<AutoFiledResponse>(as("/auto-filed"), 200)).count).toBe(0);
    expect(await env.deps.db.select().from(itemFolders).where(eq(itemFolders.itemId, keepMe))).toHaveLength(1);

    // somebody else's items are out of reach
    const bob = await json<CreateUserResponse>(env.request("/users", { method: "POST", json: { name: "bob" } }), 201);
    const res = await env.request("/auto-filed/undo", { method: "POST", json: { itemIds: [keepMe] }, headers: { Authorization: `Bearer ${bob.token}` } });
    expect(await res.json()).toEqual({ affected: 0 });
  });

  it("lists what moderators hid or suspended so it can be restored", async () => {
    const id = await newItem("https://example.com/hide-me");
    await json<unknown>(env.request(`/moderation/items/${id}/hide`, { method: "POST" }), 204);
    const hidden = await json<HiddenItemsResponse>(env.request("/moderation/hidden"), 200);
    expect(hidden.items.map((i) => i.id)).toContain(id);
    await json<unknown>(env.request(`/moderation/items/${id}/unhide`, { method: "POST" }), 204);
    expect((await json<HiddenItemsResponse>(env.request("/moderation/hidden"), 200)).items.map((i) => i.id)).not.toContain(id);

    const victim = await json<CreateUserResponse>(env.request("/users", { method: "POST", json: { name: "victim" } }), 201);
    await json<unknown>(env.request(`/moderation/users/${victim.user.id}/suspend`, { method: "POST" }), 204);
    expect((await json<SuspendedAccountsResponse>(env.request("/moderation/suspended"), 200)).accounts.map((a) => a.name)).toContain("victim");
    expect((await as("/moderation/hidden")).status).toBe(403);
  });
});
