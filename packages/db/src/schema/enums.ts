import {
  assignedByValues,
  availabilities,
  feedbackVerdicts,
  fetchStatuses,
  fieldTypes,
  itemKinds,
  keywordSources,
  mediaTypes,
  reportStatuses,
  reportTargets,
  visibilities,
  workflows,
} from "@magpie/shared/api";
import { pgEnum } from "drizzle-orm/pg-core";

export const itemKind = pgEnum("item_kind", itemKinds);
export const fetchStatus = pgEnum("fetch_status", fetchStatuses);
export const availability = pgEnum("availability", availabilities);
export const workflow = pgEnum("workflow", workflows);
export const visibility = pgEnum("visibility", visibilities);
export const feedbackVerdict = pgEnum("feedback_verdict", feedbackVerdicts);
export const reportTarget = pgEnum("report_target", reportTargets);
export const reportStatus = pgEnum("report_status", reportStatuses);
export const mediaType = pgEnum("media_type", mediaTypes);
export const assignedBy = pgEnum("assigned_by", assignedByValues);
export const keywordSource = pgEnum("keyword_source", keywordSources);
export const fieldType = pgEnum("field_type", fieldTypes);
