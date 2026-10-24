import { describe, expect, it } from "vitest";
import { assertCredential } from "./source-credentials.ts";

describe("assertCredential", () => {
  it("accepts cookies that carry a sessionid", () => {
    expect(() => { assertCredential("cookies", ".instagram.com\tTRUE\t/\tTRUE\t0\tsessionid\tabc"); }).not.toThrow();
  });

  it("rejects cookies without one", () => {
    expect(() => { assertCredential("cookies", ".instagram.com\tTRUE\t/\tTRUE\t0\tcsrftoken\tabc"); }).toThrow(/sessionid/);
  });

  it("accepts a base64 session and rejects anything else", () => {
    expect(() => { assertCredential("session", "gASV".repeat(20)); }).not.toThrow();
    expect(() => { assertCredential("session", "not base64 at all!"); }).toThrow(/base64/);
    expect(() => { assertCredential("session", "AAAA"); }).toThrow(/base64/);
  });
});
