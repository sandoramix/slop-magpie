import { describe, expect, it } from "vitest";
import { DEFAULT_STORAGE_LIMIT_BYTES, UpdateUserBody } from "./users.ts";

describe("UpdateUserBody", () => {
  it("accepts a role, a storage limit, null (unlimited) or both", () => {
    expect(UpdateUserBody.safeParse({ role: "admin" }).success).toBe(true);
    expect(UpdateUserBody.safeParse({ storageLimitBytes: 1024 }).success).toBe(true);
    expect(UpdateUserBody.safeParse({ storageLimitBytes: null }).success).toBe(true);
    expect(UpdateUserBody.safeParse({ role: "user", storageLimitBytes: 5 }).success).toBe(true);
  });

  it("rejects an empty body and non-positive limits", () => {
    expect(UpdateUserBody.safeParse({}).success).toBe(false);
    expect(UpdateUserBody.safeParse({ storageLimitBytes: 0 }).success).toBe(false);
    expect(UpdateUserBody.safeParse({ storageLimitBytes: -1 }).success).toBe(false);
  });

  it("defaults to 50 GB", () => {
    expect(DEFAULT_STORAGE_LIMIT_BYTES).toBe(53_687_091_200);
  });
});
