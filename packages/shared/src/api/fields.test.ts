import { describe, expect, it } from "vitest";
import { CreateFieldBody, customValuesSchema, formatFieldValue } from "./fields.ts";

describe("custom fields", () => {
  const defs = [
    { key: "cuisine", type: "select" as const, options: ["thai", "italian"] },
    { key: "minutes", type: "number" as const, options: null },
    { key: "diet", type: "multiselect" as const, options: ["vegan", "gf"] },
    { key: "when", type: "date" as const, options: null },
  ];
  const schema = customValuesSchema(defs);

  it("accepts valid values and null", () => {
    expect(schema.safeParse({ cuisine: "thai", minutes: 20, diet: ["vegan"], when: "2026-01-02" }).success).toBe(true);
    expect(schema.safeParse({ cuisine: null }).success).toBe(true);
  });

  it("rejects wrong types, unknown options and unknown keys", () => {
    expect(schema.safeParse({ cuisine: "french" }).success).toBe(false);
    expect(schema.safeParse({ minutes: "20" }).success).toBe(false);
    expect(schema.safeParse({ diet: ["keto"] }).success).toBe(false);
    expect(schema.safeParse({ when: "02/01/2026" }).success).toBe(false);
    expect(schema.safeParse({ nope: 1 }).success).toBe(false);
  });

  it("requires options for select types", () => {
    expect(CreateFieldBody.safeParse({ key: "x", label: "X", type: "select" }).success).toBe(false);
    expect(CreateFieldBody.safeParse({ key: "x", label: "X", type: "select", options: ["a"] }).success).toBe(true);
    expect(CreateFieldBody.safeParse({ key: "Bad Key", label: "X", type: "text" }).success).toBe(false);
  });

  it("formats values", () => {
    expect(formatFieldValue("duration", 3720)).toBe("1h 2m");
    expect(formatFieldValue("boolean", false)).toBe("No");
    expect(formatFieldValue("multiselect", ["a", "b"])).toBe("a, b");
  });
});
