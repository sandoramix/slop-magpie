import { z } from "zod";
import { HexColor, Name } from "./common.ts";

export const Tag = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.string().nullable(),
  itemCount: z.number().int().nonnegative(),
});
export type Tag = z.infer<typeof Tag>;

export const TagsResponse = z.object({ tags: z.array(Tag) });
export type TagsResponse = z.infer<typeof TagsResponse>;

export const CreateTagBody = z.object({
  name: Name.max(100),
  color: HexColor.nullable().optional(),
});
export type CreateTagBody = z.infer<typeof CreateTagBody>;

export const UpdateTagBody = CreateTagBody.partial();
export type UpdateTagBody = z.infer<typeof UpdateTagBody>;

export const MergeTagBody = z.object({ intoTagId: z.uuid() });
export type MergeTagBody = z.infer<typeof MergeTagBody>;
