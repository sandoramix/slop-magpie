import { describe, expect, it } from "vitest";
import { checkPublicUrl } from "./url.ts";

describe("checkPublicUrl", () => {
  it.each([
    "https://www.instagram.com/reel/ABC123/",
    "http://example.com/page?x=1",
    "https://1.1.1.1/",
    "https://[2606:4700::1111]/",
  ])("accepts %s", (input) => {
    expect(checkPublicUrl(input).ok).toBe(true);
  });

  it.each([
    ["not a url", "invalid_url"],
    ["ftp://example.com/file", "unsupported_scheme"],
    ["file:///etc/passwd", "unsupported_scheme"],
    ["javascript:alert(1)", "unsupported_scheme"],
    ["https://user:pw@example.com/", "credentials_in_url"],
    ["https://example.com:8080/", "blocked_port"],
    ["http://localhost/", "blocked_host"],
    ["http://foo.localhost/", "blocked_host"],
    ["http://router/", "blocked_host"],
    ["http://nas.local/", "blocked_host"],
    ["http://127.0.0.1/", "blocked_host"],
    ["http://0x7f.1/", "blocked_host"],
    ["http://2130706433/", "blocked_host"],
    ["http://[::1]/", "blocked_host"],
    ["http://[::ffff:192.168.0.1]/", "blocked_host"],
    ["http://169.254.169.254/latest/meta-data", "blocked_host"],
  ])("rejects %s (%s)", (input, reason) => {
    expect(checkPublicUrl(input)).toEqual({ ok: false, reason });
  });

  it("allows configured extra ports", () => {
    expect(checkPublicUrl("https://example.com:8443/", { extraPorts: [8443] }).ok).toBe(true);
  });
});
