import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BlockedTargetError, createGuard, expandUrl, readLimited, safeFetch, type Resolver } from "./ssrf.ts";

let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const to = url.searchParams.get("to");
    if (url.pathname === "/redirect" && to) {
      res.writeHead(302, { location: to }).end();
    } else if (url.pathname === "/loop") {
      res.writeHead(301, { location: "/loop" }).end();
    } else if (url.pathname === "/big") {
      res.writeHead(200).end("x".repeat(5000));
    } else {
      res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  server.close();
});

// public-looking names that actually point at the local test server
const resolve: Resolver = (hostname) => {
  const table: Record<string, string> = { "public.test": "127.0.0.1", "evil.test": "10.0.0.5" };
  const address = table[hostname];
  return address ? Promise.resolve([{ address, family: 4 }]) : Promise.reject(new Error(`ENOTFOUND ${hostname}`));
};

const permissive = () =>
  createGuard({ resolve, extraPorts: [port], isAllowedAddress: (a) => a === "127.0.0.1" || a === "::ffff:127.0.0.1" });
const strict = () => createGuard({ resolve, extraPorts: [port] });

const base = () => `http://public.test:${port}`;

describe("ssrf guard", () => {
  it("fetches an allowed target", async () => {
    const { response, hops } = await safeFetch(permissive(), `${base()}/hello`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(hops).toHaveLength(1);
  });

  it("blocks hostnames resolving to private addresses", async () => {
    await expect(safeFetch(strict(), `${base()}/hello`)).rejects.toMatchObject({ reason: "private_address" });
    await expect(safeFetch(permissive(), `http://evil.test:${port}/`)).rejects.toBeInstanceOf(BlockedTargetError);
  });

  it("blocks private IP literals and bad schemes before any request", async () => {
    await expect(safeFetch(strict(), "http://127.0.0.1/")).rejects.toMatchObject({ reason: "blocked_host" });
    await expect(safeFetch(strict(), "http://[::1]/")).rejects.toMatchObject({ reason: "blocked_host" });
    await expect(safeFetch(strict(), "file:///etc/passwd")).rejects.toMatchObject({ reason: "unsupported_scheme" });
    await expect(safeFetch(strict(), "http://public.test:6379/")).rejects.toMatchObject({ reason: "blocked_port" });
  });

  it("checks every redirect hop", async () => {
    const guard = permissive();
    const ok = await safeFetch(guard, `${base()}/redirect?to=${encodeURIComponent(`${base()}/final`)}`);
    expect(ok.url.pathname).toBe("/final");
    expect(ok.hops).toHaveLength(2);

    for (const target of ["http://169.254.169.254/latest/meta-data", `http://evil.test:${port}/`, "http://localhost/"]) {
      await expect(safeFetch(guard, `${base()}/redirect?to=${encodeURIComponent(target)}`)).rejects.toBeInstanceOf(
        BlockedTargetError,
      );
    }
  });

  it("re-checks the address at connect time (DNS rebinding)", async () => {
    let calls = 0;
    const rebinding: Resolver = () => {
      calls += 1;
      const address = calls === 1 ? "127.0.0.1" : "10.0.0.5";
      return Promise.resolve([{ address, family: 4 }]);
    };
    const guard = createGuard({ resolve: rebinding, extraPorts: [port], isAllowedAddress: (a) => a === "127.0.0.1" });
    await expect(safeFetch(guard, `${base()}/hello`)).rejects.toThrow();
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it("limits redirects", async () => {
    await expect(safeFetch(permissive(), `${base()}/loop`)).rejects.toMatchObject({ reason: "too_many_redirects" });
  });

  it("limits body size", async () => {
    const { response } = await safeFetch(permissive(), `${base()}/big`);
    await expect(readLimited(response, 1000)).rejects.toMatchObject({ reason: "too_large" });
    const small = await safeFetch(permissive(), `${base()}/hello`);
    expect(new TextDecoder().decode(await readLimited(small.response, 1000))).toBe("ok");
  });

  it("expands short links", async () => {
    const { url } = await expandUrl(permissive(), `${base()}/redirect?to=${encodeURIComponent(`${base()}/long/path`)}`);
    expect(url.href).toBe(`${base()}/long/path`);
  });
});
