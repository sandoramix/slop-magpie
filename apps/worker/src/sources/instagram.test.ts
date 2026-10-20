import { describe, expect, it } from "vitest";
import { instagram } from "./instagram.ts";

const credentials = { username: "me", password: "hunter2" };

function reply(body: unknown, cookies: string[], status = 200): Response {
  const headers = new Headers({ "content-type": "application/json" });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(JSON.stringify(body), { status, headers });
}

/** Fake fetch: first call is the login page, second the ajax login. */
function fakeFetch(login: Response) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), ...(init ? { init } : {}) });
    return calls.length === 1 ? reply({}, ["csrftoken=tok; Max-Age=31449600; Path=/", "mid=m1; Max-Age=31449600"]) : login;
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

describe("instagram.login", () => {
  it("returns cookies.txt with the session and posts the csrf token", async () => {
    const { fetch, calls } = fakeFetch(reply({ authenticated: true, user: true }, ["sessionid=sid; Max-Age=31536000", "ds_user_id=7; Max-Age=7776000"]));
    const text = await instagram.login!({ fetch, credentials });
    expect(text).toContain("\tsessionid\tsid\n");
    expect(text).toContain("\tcsrftoken\ttok\n");
    const headers = calls[1]?.init?.headers as Record<string, string>;
    expect(headers["x-csrftoken"]).toBe("tok");
    expect(String(calls[1]?.init?.body)).toContain("enc_password=%23PWD_INSTAGRAM_BROWSER%3A0%3A");
  });

  it("explains a checkpoint without leaking the password", async () => {
    const { fetch } = fakeFetch(reply({ message: "checkpoint_required", checkpoint_url: "/challenge/1/" }, [], 400));
    const error = await instagram.login!({ fetch, credentials }).catch((e: unknown) => e);
    expect((error as Error).message).toMatch(/checkpoint/);
    expect((error as Error).message).not.toContain("hunter2");
  });

  it("reports a wrong password", async () => {
    const { fetch } = fakeFetch(reply({ authenticated: false, user: true }, [], 400));
    await expect(instagram.login!({ fetch, credentials })).rejects.toThrow(/wrong password/);
  });
});
