import { z } from "zod";
import { HexColor, Icon, Name } from "./common.ts";
import { ItemFilter, ItemSort } from "./items.ts";

export const SmartFolderQuery = ItemFilter.extend({ sort: ItemSort.optional() });
export type SmartFolderQuery = z.infer<typeof SmartFolderQuery>;

export const SmartFolder = z.object({
  id: z.uuid(),
  name: z.string(),
  icon: z.string().nullable(),
  color: z.string().nullable(),
  query: SmartFolderQuery,
  position: z.number().int(),
});
export type SmartFolder = z.infer<typeof SmartFolder>;

export const SmartFoldersResponse = z.object({ smartFolders: z.array(SmartFolder) });
export type SmartFoldersResponse = z.infer<typeof SmartFoldersResponse>;

export const CreateSmartFolderBody = z.object({
  name: Name,
  query: SmartFolderQuery,
  icon: Icon.nullable().optional(),
  color: HexColor.nullable().optional(),
});
export type CreateSmartFolderBody = z.infer<typeof CreateSmartFolderBody>;

export const UpdateSmartFolderBody = z
  .object({
    name: Name,
    query: SmartFolderQuery,
    icon: Icon.nullable(),
    color: HexColor.nullable(),
    position: z.number().int().min(0).max(1_000_000),
  })
  .partial();
export type UpdateSmartFolderBody = z.infer<typeof UpdateSmartFolderBody>;
