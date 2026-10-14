import { describe, expect, it } from "vitest";
import { signMediaKey, verifyMediaSignature } from "./signer.ts";

const SECRET = "x".repeat(48);
const KEY = "items/0190a000-0000-7000-8000-000000000000/0.mp4";

describe("media signatures", () => {
  it("round-trips", () => {
    const sig = signMediaKey(SECRET, KEY, 2000);
    expect(verifyMediaSignature(SECRET, KEY, 2000, sig, 1000)).toBe(true);
  });

  it("rejects expired, tampered or foreign signatures", () => {
    const sig = signMediaKey(SECRET, KEY, 2000);
    expect(verifyMediaSignature(SECRET, KEY, 2000, sig, 2001)).toBe(false);
    expect(verifyMediaSignature(SECRET, KEY, 2001, sig, 1000)).toBe(false);
    expect(verifyMediaSignature(SECRET, `${KEY}x`, 2000, sig, 1000)).toBe(false);
    expect(verifyMediaSignature("y".repeat(48), KEY, 2000, sig, 1000)).toBe(false);
    expect(verifyMediaSignature(SECRET, KEY, 2000, "short", 1000)).toBe(false);
    expect(verifyMediaSignature(SECRET, KEY, Number.NaN, sig, 1000)).toBe(false);
  });
});
