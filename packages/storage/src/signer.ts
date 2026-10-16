import { createHmac, timingSafeEqual } from "node:crypto";

// sig = base64url(HMAC-SHA256(secret, `${key}\n${exp}`)) — see docs/storage.md
export function signMediaKey(secret: string, key: string, exp: number): string {
  return createHmac("sha256", secret).update(`${key}\n${exp}`).digest("base64url");
}

export function verifyMediaSignature(
  secret: string,
  key: string,
  exp: number,
  sig: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!Number.isSafeInteger(exp) || exp < nowSeconds) return false;
  const expected = Buffer.from(signMediaKey(secret, key, exp), "base64url");
  const given = Buffer.from(sig, "base64url");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
