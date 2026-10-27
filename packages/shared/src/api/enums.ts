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

export const feedbackVerdicts = ["worked", "meh", "failed"] as const;
export const FeedbackVerdict = z.enum(feedbackVerdicts);
export type FeedbackVerdict = z.infer<typeof FeedbackVerdict>;

/** Quick reason chips on a verdict; a fixed list so answers can be counted. */
export const feedbackReasons = ["easy", "useful", "inspiring", "too_hard", "too_long", "outdated", "not_as_described", "broken"] as const;
export const FeedbackReason = z.enum(feedbackReasons);
export type FeedbackReason = z.infer<typeof FeedbackReason>;

export const reportTargets = ["item", "user"] as const;
export const ReportTarget = z.enum(reportTargets);
export type ReportTarget = z.infer<typeof ReportTarget>;

export const reportStatuses = ["open", "actioned", "dismissed"] as const;
export const ReportStatus = z.enum(reportStatuses);
export type ReportStatus = z.infer<typeof ReportStatus>;

export const mediaTypes = ["video", "image"] as const;
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
