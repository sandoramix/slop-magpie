import { pino } from "pino";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.ts";
import type { AppDeps, AuditEvent } from "./deps.ts";

const TOKEN = "t".repeat(48);

function setup(overrides: Partial<AppDeps> = {}) {
  const audits: AuditEvent[] = [];
  const deps: AppDeps = {
    version: "1.2.3",
    apiToken: TOKEN,
    corsOrigins: [],
    trustProxy: true,
    log: pino({ level: "silent" }),
    checkDb: () => Promise.resolve(),
    audit: (e) => {
      audits.push(e);
      return Promise.resolve();
    },
    countItemsBySource: () => Promise.resolve(new Map([["instagram", 3]])),
    ...overrides,
  };
  const { app } = createApp(deps);
  return { app, audits };
}

const auth = { Authorization: `Bearer ${TOKEN}` };

describe("health", () => {
  it("is public and reports the version", async () => {
    const { app } = setup();
    const res = await app.request("/api/v1/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: "1.2.3" });
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
  });

  it("returns 503 when the database is down", async () => {
    const { app } = setup({ checkDb: () => Promise.reject(new Error("down")) });
    const res = await app.request("/api/v1/health");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, version: "1.2.3" });
  });
});

describe("auth", () => {
  it("rejects missing and wrong tokens and audits them", async () => {
    const { app, audits } = setup();
    const missing = await app.request("/api/v1/sources");
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ error: { code: "unauthorized", message: "Missing or invalid token" } });

    const wrong = await app.request("/api/v1/sources", {
      headers: { Authorization: "Bearer nope", "X-Forwarded-For": "1.2.3.4", "User-Agent": "ua" },
    });
    expect(wrong.status).toBe(401);
    expect(audits).toHaveLength(2);
    expect(audits[1]).toMatchObject({ action: "auth.fail", ip: "1.2.3.4", userAgent: "ua", details: { reason: "bad_token" } });
    expect(JSON.stringify(audits)).not.toContain("nope");
  });

  it("answers 401 (not 404) for unknown paths without a token", async () => {
    const { app } = setup();
    expect((await app.request("/api/v1/does-not-exist")).status).toBe(401);
    const res = await app.request("/api/v1/does-not-exist", { headers: auth });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "Not found" } });
  });

  it("rate-limits an IP after 10 failures, even with the right token", async () => {
    const { app, audits } = setup();
    const from = (ip: string, headers: Record<string, string> = {}) =>
      app.request("/api/v1/sources", { headers: { "X-Forwarded-For": ip, ...headers } });

    for (let i = 0; i < 10; i++) expect((await from("9.9.9.9")).status).toBe(401);
    expect(audits.at(-1)?.action).toBe("auth.rate_limited");
    expect((await from("9.9.9.9", auth)).status).toBe(429);
    // other clients are unaffected
    expect((await from("8.8.8.8", auth)).status).toBe(200);
  });

  it("uses the last X-Forwarded-For hop", async () => {
    const { app, audits } = setup();
    await app.request("/api/v1/sources", { headers: { "X-Forwarded-For": "6.6.6.6, 5.5.5.5" } });
    expect(audits[0]?.ip).toBe("5.5.5.5");
  });
});

describe("sources", () => {
  it("lists the registry with item counts", async () => {
    const { app } = setup();
    const res = await app.request("/api/v1/sources", { headers: auth });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sources: { id: string; itemCount: number }[] };
    expect(body.sources.map((s) => [s.id, s.itemCount])).toEqual([
      ["instagram", 3],
      ["generic", 0],
    ]);
  });
});

describe("errors", () => {
  it("hides internal errors", async () => {
    const error = vi.fn();
    const log = pino({ level: "silent" });
    log.error = error;
    const { app } = setup({ log, countItemsBySource: () => Promise.reject(new Error("secret detail")) });
    const res = await app.request("/api/v1/sources", { headers: auth });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: "internal", message: "Internal error" } });
    expect(error).toHaveBeenCalled();
  });

  it("limits body size", async () => {
    const { app } = setup();
    const res = await app.request("/api/v1/sources", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json", "Content-Length": String(70_000) },
      body: "x".repeat(70_000),
    });
    expect(res.status).toBe(413);
  });
});
