import { Readable } from "node:stream";
import { fieldDefs, folders, itemFolderSuggestions, itemKeywords, items, itemTagSuggestions, media, smartFolders, tags } from "@magpie/db";
import type { CreateItemResponse, FieldDef, Folder, ItemDetail, ItemListResponse, SmartFolder, StatsResponse, Tag } from "@magpie/shared/api";
import { itemKeys } from "@magpie/storage";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { type IntegrationEnv, integrationEnv } from "./testing.ts";

const serverUrl = inject("databaseUrl");

describe.skipIf(!serverUrl)("api (integration)", () => {
  let env: IntegrationEnv;

  beforeAll(async () => {
    env = await integrationEnv(serverUrl);
  });
  afterAll(async () => {
    await env.close();
  });
  beforeEach(async () => {
    for (const table of [items, folders, tags, fieldDefs, smartFolders]) await env.deps.db.delete(table);
    env.jobs.sent.length = 0;
  });

  const json = async <T>(res: Response | Promise<Response>, status: number): Promise<T> => {
    const r = await res;
    const body: unknown = r.status === 204 ? null : await r.json();
    expect(r.status, JSON.stringify(body)).toBe(status);
    return body as T;
  };

  const save = (url: string, extra: Record<string, unknown> = {}) =>
    env.request("/items", { method: "POST", json: { url, ...extra } });

  const createFolder = (name: string, parentId?: string) =>
    json<Folder>(env.request("/folders", { method: "POST", json: { name, parentId } }), 201);
  const createTag = (name: string) => json<Tag>(env.request("/tags", { method: "POST", json: { name } }), 201);

  describe("saving", () => {
    it("creates, enqueues and dedupes across URL variants", async () => {
      const first = await json<CreateItemResponse>(save("https://www.instagram.com/reel/ABCdef123/?igsh=xyz"), 202);
      expect(first.duplicate).toBe(false);
      expect(first.item).toMatchObject({ source: "instagram", sourceItemId: "ABCdef123", fetchStatus: "pending", workflow: "inbox" });
      expect(env.jobs.sent).toEqual([{ queue: "fetch", data: { itemId: first.item.id } }]);

      const again = await json<CreateItemResponse>(save("https://instagram.com/p/ABCdef123"), 200);
      expect(again).toMatchObject({ duplicate: true, item: { id: first.item.id } });
      expect(env.jobs.sent).toHaveLength(1);
    });

    it("files a duplicate into the folders picked when sharing again", async () => {
      const folder = await createFolder("Later");
      const { item } = await json<CreateItemResponse>(save("https://example.com/a"), 202);
      const again = await json<CreateItemResponse>(save("https://example.com/a?utm_source=x", { folderIds: [folder.id] }), 200);
      expect(again.item.id).toBe(item.id);
      expect(again.item.folders.map((f) => f.name)).toEqual(["Later"]);
    });

    it("rejects private targets and unknown folder ids", async () => {
      expect((await save("http://192.168.1.1/admin")).status).toBe(422);
      expect((await save("ftp://example.com/x")).status).toBe(422);
      expect((await save("https://example.com/x", { folderIds: ["00000000-0000-7000-8000-000000000000"] })).status).toBe(400);
    });
  });

  describe("editing", () => {
    it("patches fields and validates custom values", async () => {
      const { item } = await json<CreateItemResponse>(save("https://example.com/recipe"), 202);
      await json<FieldDef>(env.request("/fields", { method: "POST", json: { key: "minutes", label: "Minutes", type: "number" } }), 201);
      await json<FieldDef>(
        env.request("/fields", { method: "POST", json: { key: "cuisine", label: "Cuisine", type: "select", options: ["thai", "italian"] } }),
        201,
      );

      const patched = await json<ItemDetail>(
        env.request(`/items/${item.id}`, {
          method: "PATCH",
          json: { title: "Pad thai", favorite: true, rating: 4, workflow: "to_try", custom: { minutes: 25, cuisine: "thai" } },
        }),
        200,
      );
      expect(patched).toMatchObject({ title: "Pad thai", favorite: true, rating: 4, workflow: "to_try", custom: { minutes: 25, cuisine: "thai" } });

      expect((await env.request(`/items/${item.id}`, { method: "PATCH", json: { custom: { cuisine: "french" } } })).status).toBe(400);
      expect((await env.request(`/items/${item.id}`, { method: "PATCH", json: { custom: { unknown: 1 } } })).status).toBe(400);

      const cleared = await json<ItemDetail>(env.request(`/items/${item.id}`, { method: "PATCH", json: { custom: { minutes: null } } }), 200);
      expect(cleared.custom).toEqual({ cuisine: "thai" });
    });

    it("manages folders, tags, keywords and suggestions", async () => {
      const { item } = await json<CreateItemResponse>(save("https://example.com/k"), 202);
      const [a, b] = [await createFolder("A"), await createFolder("B")];
      const tag = await createTag("pasta");

      let d = await json<ItemDetail>(env.request(`/items/${item.id}/folders`, { method: "PUT", json: { folderIds: [a.id, b.id] } }), 200);
      expect(d.folders.map((f) => f.name)).toEqual(["A", "B"]);
      d = await json<ItemDetail>(env.request(`/items/${item.id}/folders`, { method: "PUT", json: { folderIds: [b.id] } }), 200);
      expect(d.folders.map((f) => f.name)).toEqual(["B"]);

      d = await json<ItemDetail>(env.request(`/items/${item.id}/tags`, { method: "PUT", json: { tagIds: [tag.id] } }), 200);
      expect(d.tagIds).toEqual([tag.id]);

      d = await json<ItemDetail>(env.request(`/items/${item.id}/keywords`, { method: "POST", json: { keyword: "#Carbonara" } }), 200);
      expect(d.keywords).toEqual([{ keyword: "carbonara", source: "manual", weight: 1 }]);
      d = await json<ItemDetail>(env.request(`/items/${item.id}/keywords/carbonara`, { method: "DELETE" }), 200);
      expect(d.keywords).toEqual([]);

      await env.deps.db.insert(itemFolderSuggestions).values({ itemId: item.id, folderId: a.id, confidence: 0.6 });
      const other = await createTag("quick");
      await env.deps.db.insert(itemTagSuggestions).values({ itemId: item.id, tagId: other.id, confidence: 0.5 });
      d = await json<ItemDetail>(env.request(`/items/${item.id}`), 200);
      expect(d.suggestionCount).toBe(2);
      expect(d.suggestions.folders).toEqual([{ id: a.id, name: "A", confidence: 0.6 }]);

      d = await json<ItemDetail>(env.request(`/items/${item.id}/suggestions/accept`, { method: "POST", json: { folderIds: [a.id] } }), 200);
      expect(d.folders.map((f) => [f.name, f.assignedBy])).toEqual([
        ["A", "manual"],
        ["B", "manual"],
      ]);
      d = await json<ItemDetail>(env.request(`/items/${item.id}/suggestions/dismiss`, { method: "POST", json: {} }), 200);
      expect(d.suggestions).toEqual({ folders: [], tags: [] });
      expect(d.tags.map((t) => t.name)).toEqual(["pasta"]);
    });

    it("deletes items and enqueues blob deletion", async () => {
      const { item } = await json<CreateItemResponse>(save("https://example.com/del"), 202);
      expect((await env.request(`/items/${item.id}`, { method: "DELETE" })).status).toBe(204);
      expect(env.jobs.sent.at(-1)).toEqual({ queue: "blobDelete", data: { itemId: item.id } });
      expect((await env.request(`/items/${item.id}`)).status).toBe(404);
    });

    it("refetches and runs bulk operations", async () => {
      const ids: string[] = [];
      for (const n of [1, 2, 3]) ids.push((await json<CreateItemResponse>(save(`https://example.com/b${n}`), 202)).item.id);
      await env.deps.db.update(items).set({ fetchStatus: "failed", fetchError: "boom" }).where(eq(items.id, ids[0] ?? ""));
      const r = await json<ItemDetail>(env.request(`/items/${ids[0] ?? ""}/refetch`, { method: "POST" }), 202);
      expect(r).toMatchObject({ fetchStatus: "pending", fetchError: null });

      const tag = await createTag("bulk");
      expect(await json(env.request("/items/bulk", { method: "POST", json: { ids, op: "addTag", tagId: tag.id } }), 200)).toEqual({ affected: 3 });
      await json(env.request("/items/bulk", { method: "POST", json: { ids: ids.slice(0, 2), op: "setWorkflow", workflow: "done" } }), 200);
      const stats = await json<StatsResponse>(env.request("/stats"), 200);
      expect(stats.byWorkflow).toMatchObject({ done: 2, inbox: 1 });
      expect(stats.total).toBe(3);

      await json(env.request("/items/bulk", { method: "POST", json: { ids, op: "delete" } }), 200);
      expect((await json<StatsResponse>(env.request("/stats"), 200)).total).toBe(0);
    });
  });

  describe("listing and search", () => {
    async function seed() {
      const recipes = await createFolder("Ricette");
      const primi = await createFolder("Primi", recipes.id);
      const travel = await createFolder("Viaggi");
      const pasta = await createTag("Pasta");
      const rows = [
        { url: "https://example.com/1", title: "Pasta al limone", caption: "Ricetta veloce #pasta #limone", author: "chef", folder: primi.id },
        { url: "https://example.com/2", title: "Spaghetti carbonara", caption: "La vera carbonara romana", author: "nonna", folder: primi.id },
        { url: "https://example.com/3", title: "Weekend in Lisbon", caption: "Travel guide", author: "wanderer", folder: travel.id },
      ];
      const ids: string[] = [];
      for (const r of rows) {
        const { item } = await json<CreateItemResponse>(save(r.url, { folderIds: [r.folder] }), 202);
        await env.deps.db
          .update(items)
          .set({ title: r.title, caption: r.caption, authorHandle: r.author, fetchStatus: "ready" })
          .where(eq(items.id, item.id));
        ids.push(item.id);
      }
      await env.deps.db.insert(itemKeywords).values({ itemId: ids[0] ?? "", keyword: "limone", source: "hashtag", weight: 1 });
      await env.request(`/items/${ids[1] ?? ""}/tags`, { method: "PUT", json: { tagIds: [pasta.id] } });
      await env.request(`/items/${ids[2] ?? ""}`, { method: "PATCH", json: { favorite: true } });
      return { ids, recipes, primi, travel, pasta };
    }

    const titles = async (query: string) =>
      (await json<ItemListResponse>(env.request(`/items?${query}`), 200)).items.map((i) => i.title).sort();

    it("filters by structured params and the query language", async () => {
      const { recipes, primi } = await seed();
      expect(await titles(`folderId=${recipes.id}`)).toEqual([]);
      expect(await titles(`folderId=${recipes.id}&includeSubfolders=true`)).toEqual(["Pasta al limone", "Spaghetti carbonara"]);
      expect(await titles(`folderId=${primi.id}&favorite=true`)).toEqual([]);
      expect(await titles(`q=${encodeURIComponent('folder:"Ricette"')}`)).toEqual(["Pasta al limone", "Spaghetti carbonara"]);
      expect(await titles(`q=${encodeURIComponent("tag:pasta")}`)).toEqual(["Spaghetti carbonara"]);
      expect(await titles(`q=${encodeURIComponent("is:fav")}`)).toEqual(["Weekend in Lisbon"]);
      expect(await titles(`q=${encodeURIComponent("from:@nonna")}`)).toEqual(["Spaghetti carbonara"]);
      expect(await titles(`q=${encodeURIComponent("-folder:Viaggi carbo")}`)).toEqual(["Spaghetti carbonara"]);
      expect(await titles(`q=${encodeURIComponent("saved:>2000-01-01 source:generic kind:link")}`)).toHaveLength(3);
      expect(await titles(`q=${encodeURIComponent("saved:<2000-01-01")}`)).toEqual([]);
    });

    it("matches text, keywords, tags and typos", async () => {
      await seed();
      expect(await titles("q=limone")).toEqual(["Pasta al limone"]);
      expect(await titles("q=pasta")).toEqual(["Pasta al limone", "Spaghetti carbonara"]);
      expect(await titles("q=lisbn")).toEqual(["Weekend in Lisbon"]);
      expect(await titles(`q=${encodeURIComponent('"vera carbonara"')}`)).toEqual(["Spaghetti carbonara"]);
      const ranked = await json<ItemListResponse>(env.request(`/items?q=carbonara&sort=relevance`), 200);
      expect(ranked.items[0]?.title).toBe("Spaghetti carbonara");
    });

    it("paginates with cursors", async () => {
      await seed();
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const page: ItemListResponse = await json<ItemListResponse>(
          env.request(`/items?limit=2${cursor ? `&cursor=${cursor}` : ""}`),
          200,
        );
        seen.push(...page.items.map((i) => i.id));
        cursor = page.nextCursor;
      } while (cursor);
      expect(new Set(seen).size).toBe(3);
      expect((await env.request("/items?cursor=garbage")).status).toBe(400);

      const posted = await json<ItemListResponse>(env.request("/items?limit=2&sort=posted_desc"), 200);
      expect(posted.nextCursor).not.toBeNull();
      const rest = await json<ItemListResponse>(env.request(`/items?limit=2&sort=posted_desc&cursor=${posted.nextCursor ?? ""}`), 200);
      expect(rest.items).toHaveLength(1);
    });

    it("applies smart folders", async () => {
      await seed();
      const sf = await json<SmartFolder>(
        env.request("/smart-folders", { method: "POST", json: { name: "Primi", query: { q: 'folder:"Ricette/Primi"' } } }),
        201,
      );
      expect(await titles(`smartFolderId=${sf.id}`)).toEqual(["Pasta al limone", "Spaghetti carbonara"]);
      expect(await titles(`smartFolderId=${sf.id}&q=limone`)).toEqual(["Pasta al limone"]);
      const list = await json<{ smartFolders: SmartFolder[] }>(env.request("/smart-folders"), 200);
      expect(list.smartFolders.map((s) => s.name)).toEqual(["Primi"]);
    });

    it("filters by custom fields", async () => {
      const { ids } = await seed();
      await env.request("/fields", { method: "POST", json: { key: "minutes", label: "Minutes", type: "number" } });
      await env.request("/fields", { method: "POST", json: { key: "diet", label: "Diet", type: "multiselect", options: ["vegan", "gf"] } });
      await env.request(`/items/${ids[0] ?? ""}`, { method: "PATCH", json: { custom: { minutes: 10, diet: ["vegan"] } } });
      await env.request(`/items/${ids[1] ?? ""}`, { method: "PATCH", json: { custom: { minutes: 30 } } });
      expect(await titles(`q=${encodeURIComponent("field:minutes<20")}`)).toEqual(["Pasta al limone"]);
      expect(await titles(`q=${encodeURIComponent("field:minutes>=10")}`)).toHaveLength(2);
      expect(await titles(`q=${encodeURIComponent("field:diet=vegan")}`)).toEqual(["Pasta al limone"]);
      expect(await titles(`q=${encodeURIComponent("field:nope=1")}`)).toEqual([]);
    });
  });

  describe("folders and tags", () => {
    it("prevents cycles and duplicate names", async () => {
      const a = await createFolder("A");
      const b = await createFolder("B", a.id);
      const c = await createFolder("C", b.id);
      expect((await env.request(`/folders/${a.id}`, { method: "PATCH", json: { parentId: c.id } })).status).toBe(400);
      expect((await env.request(`/folders/${a.id}`, { method: "PATCH", json: { parentId: a.id } })).status).toBe(400);
      expect((await env.request("/folders", { method: "POST", json: { name: "a" } })).status).toBe(409);
      const moved = await json<Folder>(env.request(`/folders/${c.id}`, { method: "PATCH", json: { parentId: null, name: "C2" } }), 200);
      expect(moved).toMatchObject({ parentId: null, name: "C2" });

      expect((await env.request(`/folders/${a.id}`, { method: "DELETE" })).status).toBe(204);
      const { folders } = await json<{ folders: Folder[] }>(env.request("/folders"), 200);
      expect(folders.map((f) => f.name)).toEqual(["C2"]);
    });

    it("merges tags", async () => {
      const [x, y] = [await createTag("x"), await createTag("y")];
      const { item: i1 } = await json<CreateItemResponse>(save("https://example.com/t1", { tagIds: [x.id] }), 202);
      await json<CreateItemResponse>(save("https://example.com/t2", { tagIds: [x.id, y.id] }), 202);
      const merged = await json<Tag>(env.request(`/tags/${x.id}/merge`, { method: "POST", json: { intoTagId: y.id } }), 200);
      expect(merged).toMatchObject({ name: "y", itemCount: 2 });
      expect((await json<ItemDetail>(env.request(`/items/${i1.id}`), 200)).tagIds).toEqual([y.id]);
      expect((await env.request("/tags", { method: "POST", json: { name: "Y" } })).status).toBe(409);
    });

    it("deleting a field strips its values", async () => {
      const { item } = await json<CreateItemResponse>(save("https://example.com/f"), 202);
      const field = await json<FieldDef>(env.request("/fields", { method: "POST", json: { key: "note", label: "Note", type: "text" } }), 201);
      await env.request(`/items/${item.id}`, { method: "PATCH", json: { custom: { note: "hi" } } });
      expect((await env.request(`/fields/${field.id}`, { method: "DELETE" })).status).toBe(204);
      expect((await json<ItemDetail>(env.request(`/items/${item.id}`), 200)).custom).toEqual({});
    });
  });

  describe("media", () => {
    it("serves signed media with Range and rejects bad signatures", async () => {
      const { item } = await json<CreateItemResponse>(save("https://example.com/m"), 202);
      const key = itemKeys.original(item.id, 0, "jpg");
      const thumb = itemKeys.thumb(item.id, 0);
      await env.deps.store.put(key, Readable.from([Buffer.from("0123456789")]), { contentType: "image/jpeg" });
      await env.deps.store.put(thumb, Readable.from([Buffer.from("thumb")]), { contentType: "image/webp" });
      await env.deps.db.insert(media).values({
        itemId: item.id,
        position: 0,
        type: "image",
        storageKey: key,
        thumbKey: thumb,
        mime: "image/jpeg",
        bytes: 10,
        width: 300,
        height: 200,
        sha256: "x",
      });

      const list = await json<ItemListResponse>(env.request("/items"), 200);
      expect(list.items[0]).toMatchObject({ aspectRatio: 1.5, mediaCount: 1 });
      const detail = await json<ItemDetail>(env.request(`/items/${item.id}`), 200);
      const url = new URL(detail.media[0]?.url ?? "");
      const path = `${url.pathname}${url.search}`;

      // signed media needs no bearer token
      const full = await env.request(path.replace("/api/v1", ""), { headers: { Authorization: "" } });
      expect(full.status).toBe(200);
      expect(await full.text()).toBe("0123456789");
      expect(full.headers.get("content-type")).toBe("image/jpeg");

      const part = await env.request(path.replace("/api/v1", ""), { headers: { Range: "bytes=2-4" } });
      expect(part.status).toBe(206);
      expect(part.headers.get("content-range")).toBe("bytes 2-4/10");
      expect(await part.text()).toBe("234");

      expect((await env.request(path.replace("/api/v1", ""), { headers: { Range: "bytes=50-" } })).status).toBe(416);
      expect((await env.request(path.replace("/api/v1", "").replace(/sig=[^&]+/, "sig=AAAA"))).status).toBe(403);
      expect(new URL(list.items[0]?.thumbUrl ?? "").pathname).toContain(".thumb.webp");
    });
  });
});
