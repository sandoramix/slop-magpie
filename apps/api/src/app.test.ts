import { pino } from "pino";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.ts";
import type { AppDeps } from "./deps.ts";
import { auth, unitDeps } from "./testing.ts";

function setup(overrides: Partial<AppDeps> = {}) {
  const { deps, audits } = unitDeps(overrides);
  const { app } = createApp(deps);
  return { app, audits };
}

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

describe("tokens of deleted accounts", () => {
  it("get a reason, other bad tokens do not", async () => {
    const { app } = setup({
      accounts: {
        findByTokenHash: () => Promise.resolve(null),
        findById: () => Promise.resolve(null),
        isDeletedToken: () => Promise.resolve(true),
      },
    });
    const gone = await app.request("/api/v1/sources", { headers: { Authorization: "Bearer mgp_gone" } });
    expect(gone.status).toBe(401);
    expect(await gone.json()).toEqual({
      error: { code: "unauthorized", message: "This account was deleted by an administrator", reason: "account_deleted" },
    });

    const { app: plain } = setup();
    const unknown = await plain.request("/api/v1/sources", { headers: { Authorization: "Bearer mgp_unknown" } });
    expect(await unknown.json()).toEqual({ error: { code: "unauthorized", message: "Missing or invalid token" } });
  });
});

describe("invite page", () => {
  it("is public, static, and locked down with a hash-based CSP", async () => {
    const { app } = setup();
    const res = await app.request("/invite");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'none'");
    expect(csp).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]+'/);
    expect(csp).not.toContain("unsafe-inline");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const html = await res.text();
    expect(html).toContain("Open in Magpie");
    // the token only ever travels in the URL fragment, which the server never sees
    expect(html).toContain("location.hash");
    expect(html).not.toContain("innerHTML");
  });

  it("serves a script whose hash matches the policy", async () => {
    const { createHash } = await import("node:crypto");
    const { app } = setup();
    const res = await app.request("/invite");
    const html = await res.text();
    const csp = res.headers.get("content-security-policy") ?? "";
    const script = /<script>([\s\S]*)<\/script>/.exec(html)?.[1] ?? "";
    expect(csp).toContain(`'sha256-${createHash("sha256").update(script).digest("base64")}'`);
  });
});

describe("admin page", () => {
  it("is static, stores nothing and is locked down by a hash-based CSP", async () => {
    const { createHash } = await import("node:crypto");
    const { app } = setup();
    const res = await app.request("/admin");
    expect(res.status).toBe(200);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-inline");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const html = await res.text();
    const script = /<script>([\s\S]*)<\/script>/.exec(html)?.[1] ?? "";
    expect(csp).toContain(`script-src 'sha256-${createHash("sha256").update(script).digest("base64")}'`);
    // the token lives in a variable only
    for (const forbidden of ["localStorage", "sessionStorage", "document.cookie", "innerHTML", "eval("]) expect(script).not.toContain(forbidden);
    expect(html).not.toMatch(/\son[a-z]+=/);
  });

  it("sends no token with the page itself and the API behind it stays admin-only", async () => {
    const { app } = setup();
    expect((await app.request("/api/v1/sources/instagram/credentials")).status).toBe(401);
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
    const body = (await res.json()) as { sources: { id: string; itemCount: number; enabled: boolean }[] };
    // every source with code is listed; only instagram and the generic fallback are on by default
    expect(body.sources.map((s) => s.id)).toEqual(["instagram", "tiktok", "youtube", "pinterest", "x", "reddit", "facebook", "generic"]);
    expect(body.sources.filter((s) => s.enabled).map((s) => s.id)).toEqual(["instagram", "generic"]);
    expect(body.sources.find((s) => s.id === "instagram")?.itemCount).toBe(3);
  });

  it("reports the sources an operator switched on", async () => {
    const { deps } = unitDeps({ enabledSources: ["instagram", "reddit"] });
    const res = await createApp(deps).app.request("/api/v1/sources", { headers: auth });
    const body = (await res.json()) as { sources: { id: string; enabled: boolean }[] };
    expect(body.sources.filter((s) => s.enabled).map((s) => s.id)).toEqual(["instagram", "reddit", "generic"]);
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
