// Value lists shared by the API schemas and the Postgres enums in packages/db.
import { z } from "zod";

export const itemKinds = ["video", "image", "gallery", "link"] as const;
export const ItemKind = z.enum(itemKinds);
export type ItemKind = z.infer<typeof ItemKind>;

export const fetchStatuses = ["pending", "fetching", "ready", "failed"] as const;
export const FetchStatus = z.enum(fetchStatuses);
export type FetchStatus = z.infer<typeof FetchStatus>;

export const availabilities = ["available", "gone", "unknown"] as const;
export const Availability = z.enum(availabilities);
export type Availability = z.infer<typeof Availability>;

export const workflows = ["inbox", "to_try", "done", "reference"] as const;
export const Workflow = z.enum(workflows);
export type Workflow = z.infer<typeof Workflow>;

export const visibilities = ["private", "public"] as const;
export const Visibility = z.enum(visibilities);
export type Visibility = z.infer<typeof Visibility>;

export const mediaTypes =["video", "image"] as const;
export const MediaType = z.enum(mediaTypes);
export type MediaType = z.infer<typeof MediaType>;

export const assignedByValues = ["manual", "auto"] as const;
export const AssignedBy = z.enum(assignedByValues);
export type AssignedBy = z.infer<typeof AssignedBy>;

export const keywordSources = ["hashtag", "caption", "transcript", "ocr", "manual"] as const;
export const KeywordSource = z.enum(keywordSources);
export type KeywordSource = z.infer<typeof KeywordSource>;

export const fieldTypes = ["text", "number", "boolean", "date", "duration", "url", "select", "multiselect"] as const;
export const FieldType = z.enum(fieldTypes);
export type FieldType = z.infer<typeof FieldType>;
