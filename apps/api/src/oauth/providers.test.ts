import { describe, expect, it } from "vitest";
import { createApp } from "../app.ts";
import { unitDeps } from "../testing.ts";
import { providers, suggestUsername } from "./providers.ts";

describe("provider profiles", () => {
  it("reads a Google userinfo response", () => {
    expect(providers.google.parseProfile({ sub: "1234", email: "a@b.co", email_verified: true, name: "Ann Lee", given_name: "Ann" })).toEqual({
      id: "1234",
      email: "a@b.co",
      emailVerified: true,
      nameHint: "Ann",
    });
  });

  it("uses the numeric GitHub id as a string and never trusts its email", () => {
    expect(providers.github.parseProfile({ id: 42, login: "octocat", email: "o@c.at" })).toEqual({
      id: "42",
      email: "o@c.at",
      emailVerified: false,
      nameHint: "octocat",
    });
  });

  it("reads a Discord user", () => {
    expect(providers.discord.parseProfile({ id: "80351110224678912", username: "nelly", email: null, verified: true })).toEqual({
      id: "80351110224678912",
      email: null,
      emailVerified: true,
      nameHint: "nelly",
    });
  });

  it("rejects profiles without an id", () => {
    expect(() => providers.google.parseProfile({ email: "a@b.co" })).toThrow();
    expect(() => providers.github.parseProfile({ login: "x" })).toThrow();
    expect(() => providers.discord.parseProfile({})).toThrow();
  });

  it("proposes a valid username", () => {
    expect(suggestUsername("Ann Lee")).toBe("AnnLee");
    expect(suggestUsername("Zoë")).toMatch(/^[A-Za-z0-9_.-]{3,32}$/);
    expect(suggestUsername("é")).toMatch(/^[A-Za-z0-9_.-]{3,32}$/);
    expect(suggestUsername(null)).toMatch(/^[A-Za-z0-9_.-]{3,32}$/);
    expect(suggestUsername("x".repeat(80))).toHaveLength(32);
  });
});

describe("social login routes without credentials", () => {
  const get = (deps = unitDeps().deps, path = "/api/v1/auth/config") => createApp(deps).app.request(path);

  it("offers no provider by default", async () => {
    expect(await (await get()).json()).toEqual({ mode: "invite", providers: [] });
  });

  it("offers only providers with both id and secret", async () => {
    const { deps } = unitDeps({
      oauth: {
        publicBaseUrl: "https://m.test",
        credentials: { github: { clientId: "id", clientSecret: "secret" }, google: { clientId: "id", clientSecret: "" } },
      },
    });
    expect(await (await get(deps)).json()).toEqual({ mode: "invite", providers: ["github"] });
  });

  it("refuses to start a login for a provider that is off", async () => {
    const { deps } = unitDeps({ oauth: { publicBaseUrl: "https://m.test", credentials: { github: { clientId: "id", clientSecret: "secret" } } } });
    const res = await createApp(deps).app.request("/api/v1/auth/oauth/google/start", { method: "POST" });
    expect(res.status).toBe(404);
    const none = await createApp(unitDeps().deps).app.request("/api/v1/auth/oauth/github/start", { method: "POST" });
    expect(none.status).toBe(404);
  });

  it("sends a failed callback back into the app instead of showing a page", async () => {
    const res = await createApp(unitDeps().deps).app.request("/api/v1/auth/oauth/github/callback?code=x&state=y", { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(/^magpie:\/\/oauth\?status=error&message=/);
  });

  it("rejects unknown providers", async () => {
    expect((await createApp(unitDeps().deps).app.request("/api/v1/auth/oauth/myspace/start", { method: "POST" })).status).toBe(400);
  });
});
