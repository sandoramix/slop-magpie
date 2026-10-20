import { describe, expect, it } from "vitest";
import { mergeCookies, parseSetCookies, toNetscape } from "./cookies.ts";

const NOW = Date.UTC(2026, 9, 20);

describe("parseSetCookies", () => {
  it("reads name, value and Max-Age", () => {
    const [c] = parseSetCookies(["sessionid=abc%3A1; Path=/; Max-Age=31536000; Secure; HttpOnly"], "instagram.com", NOW);
    expect(c).toEqual({ name: "sessionid", value: "abc%3A1", domain: "instagram.com", expires: NOW / 1000 + 31536000 });
  });

  it("reads Expires and keeps '=' inside values", () => {
    const [c] = parseSetCookies(["rur=A=B; Expires=Wed, 21 Oct 2026 00:00:00 GMT"], "instagram.com", NOW);
    expect(c?.value).toBe("A=B");
    expect(c?.expires).toBe(Date.UTC(2026, 9, 21) / 1000);
  });

  it("drops deleted and empty cookies", () => {
    expect(parseSetCookies(["a=; Path=/", 'b=""', "c=x; Max-Age=0", "d=x; Expires=Thu, 01 Jan 1970 00:00:00 GMT"], "instagram.com", NOW)).toEqual([]);
  });
});

describe("toNetscape", () => {
  it("writes tab-separated lines under the header", () => {
    const text = toNetscape(mergeCookies([{ name: "a", value: "1", domain: "instagram.com", expires: 0 }], [{ name: "a", value: "2", domain: "instagram.com", expires: 5 }]));
    expect(text).toBe("# Netscape HTTP Cookie File\n.instagram.com\tTRUE\t/\tTRUE\t5\ta\t2\n");
  });
});
