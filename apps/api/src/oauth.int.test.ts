import type { IdentitiesResponse, InviteResponse, LoginResponse, OAuthExchangeResponse, OAuthStartResponse } from "@magpie/shared/api";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { type IntegrationEnv, integrationEnv } from "./testing.ts";

const serverUrl = inject("databaseUrl");

describe.skipIf(!serverUrl)("social login (integration)", () => {
  let env: IntegrationEnv;
  // what the pretend provider answers; changed per test
  let profile: Record<string, unknown> = { id: 1001, login: "octo" };
  const seen: { tokenBody?: URLSearchParams | undefined } = {};

  const fakeFetch: typeof fetch = (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === "https://github.com/login/oauth/access_token") {
      seen.tokenBody = init?.body instanceof URLSearchParams ? init.body : undefined;
      return Promise.resolve(Response.json({ access_token: "provider-token" }));
    }
    if (url === "https://api.github.com/user") return Promise.resolve(Response.json(profile));
    return Promise.resolve(new Response("unexpected", { status: 500 }));
  };

  beforeAll(async () => {
    env = await integrationEnv(serverUrl, {
      oauthLimit: 1000,
      signupLimit: 1000,
      oauth: { publicBaseUrl: "https://m.test", credentials: { github: { clientId: "gh-id", clientSecret: "gh-secret" } }, fetch: fakeFetch },
    });
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
  const post = (path: string, body?: unknown, headers?: Record<string, string>) =>
    env.request(path, { method: "POST", ...(body === undefined ? {} : { json: body }), ...(headers ? { headers } : {}) });

  /** start -> provider (the test) -> callback -> the redirect back into the app */
  const runFlow = async (startPath: string, startHeaders?: Record<string, string>, code = "good-code") => {
    const { url } = await json<OAuthStartResponse>(post(startPath, undefined, startHeaders), 200);
    const authorize = new URL(url);
    expect(authorize.origin + authorize.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(authorize.searchParams.get("client_id")).toBe("gh-id");
    expect(authorize.searchParams.get("redirect_uri")).toBe("https://m.test/api/v1/auth/oauth/github/callback");
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    const state = authorize.searchParams.get("state") ?? "";
    const res = await env.request(`/auth/oauth/github/callback?code=${code}&state=${state}`, { redirect: "manual" });
    expect(res.status).toBe(302);
    return { location: new URL(res.headers.get("location") ?? ""), state };
  };

  it("signs up a first-time identity with an invite, then recognizes it", async () => {
    profile = { id: 1001, login: "octo", email: "octo@example.com" };
    const { location } = await runFlow("/auth/oauth/github/start");
    expect(location.protocol).toBe("magpie:");
    expect(location.searchParams.get("status")).toBe("ticket");
    const ticket = location.searchParams.get("ticket") ?? "";
    // the secret and verifier went to the provider, never to the app
    expect(seen.tokenBody?.get("client_secret")).toBe("gh-secret");
    expect(seen.tokenBody?.get("code_verifier")).toBeTruthy();
    expect(location.href).not.toContain("gh-secret");

    // invite-only: the first answer says what is missing, and the ticket survives it
    const needs = await json<OAuthExchangeResponse>(post("/auth/oauth/exchange", { ticket }), 200);
    expect(needs).toMatchObject({ status: "signup_required", provider: "github", suggestedUsername: "octo", inviteRequired: true });
    expect((await post("/auth/oauth/exchange", { ticket, username: "octo", inviteCode: "mgi_nope" })).status).toBe(403);

    const invite = await json<InviteResponse>(post("/invites"), 201);
    const done = await json<OAuthExchangeResponse>(post("/auth/oauth/exchange", { ticket, username: "octo", inviteCode: invite.code }), 200);
    expect(done.status).toBe("ok");
    if (done.status !== "ok") throw new Error("unreachable");
    expect(done.me).toMatchObject({ name: "octo", hasPassword: false });

    // the session works, and a ticket cannot be replayed
    const me = await json<{ name: string }>(env.request("/me", { headers: { Authorization: `Bearer ${done.token}` } }), 200);
    expect(me.name).toBe("octo");
    expect((await post("/auth/oauth/exchange", { ticket, username: "octo2", inviteCode: invite.code })).status).toBe(401);

    // the same GitHub account signs straight in next time
    const again = await runFlow("/auth/oauth/github/start");
    const back = await json<OAuthExchangeResponse>(post("/auth/oauth/exchange", { ticket: again.location.searchParams.get("ticket") ?? "" }), 200);
    expect(back).toMatchObject({ status: "ok", me: { name: "octo" } });
  });

  it("does not create an account when the username is taken, and keeps the invite", async () => {
    profile = { id: 2002, login: "other" };
    const { location } = await runFlow("/auth/oauth/github/start");
    const ticket = location.searchParams.get("ticket") ?? "";
    const invite = await json<InviteResponse>(post("/invites"), 201);
    expect((await post("/auth/oauth/exchange", { ticket, username: "octo", inviteCode: invite.code })).status).toBe(409);
    const ok = await json<OAuthExchangeResponse>(post("/auth/oauth/exchange", { ticket, username: "other", inviteCode: invite.code }), 200);
    expect(ok.status).toBe("ok");
  });

  it("rejects a state twice, an unknown state and a cancelled login", async () => {
    profile = { id: 3003, login: "third" };
    const first = await runFlow("/auth/oauth/github/start");
    const replay = await env.request(`/auth/oauth/github/callback?code=x&state=${first.state}`, { redirect: "manual" });
    expect(new URL(replay.headers.get("location") ?? "").searchParams.get("status")).toBe("error");

    const bogus = await env.request("/auth/oauth/github/callback?code=x&state=nope", { redirect: "manual" });
    expect(new URL(bogus.headers.get("location") ?? "").searchParams.get("status")).toBe("error");

    const cancelled = await env.request("/auth/oauth/github/callback?error=access_denied", { redirect: "manual" });
    expect(new URL(cancelled.headers.get("location") ?? "").searchParams.get("message")).toMatch(/cancelled/);
  });

  it("links a provider to a signed-in account and refuses to take over someone else's", async () => {
    const alice = await json<LoginResponse>(post("/auth/signup", { username: "alice", password: "correct horse battery", inviteCode: (await json<InviteResponse>(post("/invites"), 201)).code }), 201);
    const as = { Authorization: `Bearer ${alice.token}` };

    profile = { id: 4004, login: "alice-gh" };
    const linked = await runFlow("/me/identities/github/link", as);
    expect(linked.location.searchParams.get("status")).toBe("linked");
    const list = await json<IdentitiesResponse>(env.request("/me/identities", { headers: as }), 200);
    expect(list).toMatchObject({ hasPassword: true, identities: [{ provider: "github" }] });

    // octo's GitHub account (1001) is already linked to octo
    profile = { id: 1001, login: "octo" };
    const clash = await runFlow("/me/identities/github/link", as);
    expect(clash.location.searchParams.get("status")).toBe("error");

    // alice has a password, so removing the only identity is fine
    expect((await env.request("/me/identities/github", { method: "DELETE", headers: as })).status).toBe(204);
    expect((await json<IdentitiesResponse>(env.request("/me/identities", { headers: as }), 200)).identities).toEqual([]);
  });

  it("will not remove the only way into an account", async () => {
    profile = { id: 1001, login: "octo" };
    const { location } = await runFlow("/auth/oauth/github/start");
    const login = await json<OAuthExchangeResponse>(post("/auth/oauth/exchange", { ticket: location.searchParams.get("ticket") ?? "" }), 200);
    if (login.status !== "ok") throw new Error("expected a session");
    // octo signed up through GitHub: no password, no temporary token
    const res = await env.request("/me/identities/github", { method: "DELETE", headers: { Authorization: `Bearer ${login.token}` } });
    expect(res.status).toBe(409);
  });
});
