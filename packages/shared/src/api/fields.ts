import { z } from "zod";
import { Name } from "./common.ts";
import { FieldType } from "./enums.ts";

const FieldOptions = z.array(z.string().trim().min(1).max(100)).max(100);

export const FieldDef = z.object({
  id: z.uuid(),
  key: z.string(),
  label: z.string(),
  type: FieldType,
  options: z.array(z.string()).nullable(),
  position: z.number().int(),
});
export type FieldDef = z.infer<typeof FieldDef>;

export const FieldsResponse = z.object({ fields: z.array(FieldDef) });
export type FieldsResponse = z.infer<typeof FieldsResponse>;

export const FIELD_KEY = /^[a-z][a-z0-9_]{0,39}$/;

export const CreateFieldBody = z
  .object({
    key: z.string().regex(FIELD_KEY, "lowercase letters, digits and _; starts with a letter"),
    label: Name.max(100),
    type: FieldType,
    options: FieldOptions.optional(),
  })
  .refine((b) => !isSelectType(b.type) || (b.options?.length ?? 0) > 0, {
    message: "select fields need options",
    path: ["options"],
  });
export type CreateFieldBody = z.infer<typeof CreateFieldBody>;

/** Key and type are immutable: changing them would orphan stored values. */
export const UpdateFieldBody = z
  .object({
    label: Name.max(100),
    options: FieldOptions,
    position: z.number().int().min(0).max(1_000_000),
  })
  .partial();
export type UpdateFieldBody = z.infer<typeof UpdateFieldBody>;

export function isSelectType(type: FieldType): boolean {
  return type === "select" || type === "multiselect";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** zod schema for one custom field value. `null` clears the value. */
export function fieldValueSchema(def: Pick<FieldDef, "type" | "options">): z.ZodType {
  const options = def.options ?? [];
  switch (def.type) {
    case "text":
      return z.string().max(10_000);
    case "number":
      return z.number();
    case "boolean":
      return z.boolean();
    case "date":
      return z.string().regex(ISO_DATE, "expected YYYY-MM-DD");
    case "duration":
      // seconds
      return z.number().int().nonnegative();
    case "url":
      return z.url({ protocol: /^https?$/ }).max(2048);
    case "select":
      return z.string().refine((v) => options.includes(v), "not one of the options");
    case "multiselect":
      return z.array(z.string().refine((v) => options.includes(v), "not one of the options")).max(100);
  }
}

/** Validates a partial `custom` object against the definitions. Unknown keys are rejected. */
export function customValuesSchema(defs: readonly Pick<FieldDef, "key" | "type" | "options">[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const def of defs) shape[def.key] = fieldValueSchema(def).nullable().optional();
  return z.strictObject(shape);
}

/** Display form of a stored value. */
export function formatFieldValue(type: FieldType, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (type === "boolean") return value === true ? "Yes" : "No";
  if (type === "duration" && typeof value === "number") {
    const h = Math.floor(value / 3600);
    const m = Math.floor((value % 3600) / 60);
    const s = value % 60;
    return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  }
  if (Array.isArray(value)) return value.map(String).join(", ");
  return typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value);
}
