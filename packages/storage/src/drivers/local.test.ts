import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { text } from "node:stream/consumers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BlobNotFoundError, type BlobStore, InvalidKeyError, InvalidRangeError } from "../blob-store.ts";
import { verifyMediaSignature } from "../signer.ts";
import { createLocalBlobStore } from "./local.ts";

const ID = "0190a000-0000-7000-8000-000000000000";
const KEY = `items/${ID}/0.mp4`;
const SECRET = "s".repeat(48);

let root: string;
let store: BlobStore;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "magpie-blob-"));
  store = createLocalBlobStore({ root, signingSecret: SECRET, publicBaseUrl: "https://m.example.com" });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const put = (key: string, body: string) => store.put(key, Readable.from([body]), { contentType: "video/mp4" });

describe("local blob store", () => {
  it("puts, heads and gets", async () => {
    await put(KEY, "0123456789");
    expect(await store.head(KEY)).toEqual({ bytes: 10, contentType: "video/mp4" });
    const obj = await store.get(KEY);
    expect(await text(obj.body)).toBe("0123456789");
    expect(await readdir(path.join(root, "items", ID))).toEqual(["0.mp4"]);
  });

  it("serves byte ranges", async () => {
    await put(KEY, "0123456789");
    const mid = await store.get(KEY, { start: 2, end: 4 });
    expect(mid.range).toEqual({ start: 2, end: 4 });
    expect(await text(mid.body)).toBe("234");
    const open = await store.get(KEY, { start: 7 });
    expect(open.range).toEqual({ start: 7, end: 9 });
    expect(await text(open.body)).toBe("789");
    await expect(store.get(KEY, { start: 10 })).rejects.toBeInstanceOf(InvalidRangeError);
  });

  it("verifies the expected size and leaves no partial file", async () => {
    await expect(store.put(KEY, Readable.from(["abc"]), { contentType: "video/mp4", bytes: 5 })).rejects.toThrow(/size mismatch/);
    expect(await store.head(KEY)).toBeNull();
    expect(await readdir(path.join(root, "items", ID))).toEqual([]);
  });

  it("reports missing blobs", async () => {
    expect(await store.head(KEY)).toBeNull();
    await expect(store.get(KEY)).rejects.toBeInstanceOf(BlobNotFoundError);
    await expect(store.delete(KEY)).resolves.toBeUndefined();
  });

  it("deletes by key and prefix", async () => {
    await put(KEY, "a");
    await put(`items/${ID}/0.thumb.webp`, "b");
    await store.delete(KEY);
    expect(await store.head(KEY)).toBeNull();
    await store.deletePrefix(`items/${ID}/`);
    expect(await readdir(path.join(root, "items"))).toEqual([]);
  });

  it.each(["../etc/passwd.jpg", "items/../../x.jpg", "/abs/x.jpg", "items/a/b.exe", "items//x.jpg", "items/.hidden/../x.jpg", ""])(
    "rejects key %j",
    async (key) => {
      await expect(put(key, "x")).rejects.toBeInstanceOf(InvalidKeyError);
    },
  );

  it.each(["", "/", "../", "items/..", "items/../", "items"])("rejects prefix %j", async (prefix) => {
    await expect(store.deletePrefix(prefix)).rejects.toBeInstanceOf(InvalidKeyError);
  });

  it("signs URLs the API can verify", async () => {
    const url = new URL(await store.signedUrl(KEY, 60));
    expect(url.origin + url.pathname).toBe(`https://m.example.com/api/v1/media/${KEY}`);
    const exp = Number(url.searchParams.get("exp"));
    expect(verifyMediaSignature(SECRET, KEY, exp, url.searchParams.get("sig") ?? "")).toBe(true);
  });
});
