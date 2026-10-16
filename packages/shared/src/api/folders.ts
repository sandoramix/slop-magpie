import { z } from "zod";
import { HexColor, Icon, Name } from "./common.ts";

export const Folder = z.object({
  id: z.uuid(),
  parentId: z.uuid().nullable(),
  name: z.string(),
  icon: z.string().nullable(),
  color: z.string().nullable(),
  position: z.number().int(),
  /** Items linked directly to this folder (not counting subfolders). */
  itemCount: z.number().int().nonnegative(),
});
export type Folder = z.infer<typeof Folder>;

/** Flat list ordered by (parent, position, name); build the tree with `buildFolderTree`. */
export const FoldersResponse = z.object({ folders: z.array(Folder) });
export type FoldersResponse = z.infer<typeof FoldersResponse>;

export const CreateFolderBody = z.object({
  name: Name,
  parentId: z.uuid().nullable().optional(),
  icon: Icon.nullable().optional(),
  color: HexColor.nullable().optional(),
});
export type CreateFolderBody = z.infer<typeof CreateFolderBody>;

export const UpdateFolderBody = z
  .object({
    name: Name,
    parentId: z.uuid().nullable(),
    icon: Icon.nullable(),
    color: HexColor.nullable(),
    position: z.number().int().min(0).max(1_000_000),
  })
  .partial();
export type UpdateFolderBody = z.infer<typeof UpdateFolderBody>;

export interface FolderNode extends Folder {
  children: FolderNode[];
  /** "Parent/Child" path, used by the query language (`folder:"Recipes/Pasta"`). */
  path: string;
  depth: number;
}

/** Builds the folder tree from the flat list. Orphans (missing parent) become roots. */
export function buildFolderTree(folders: readonly Folder[]): FolderNode[] {
  const nodes = new Map<string, FolderNode>();
  for (const f of folders) nodes.set(f.id, { ...f, children: [], path: f.name, depth: 0 });
  const roots: FolderNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const order = (a: FolderNode, b: FolderNode) => a.position - b.position || a.name.localeCompare(b.name);
  const walk = (list: FolderNode[], prefix: string, depth: number) => {
    list.sort(order);
    for (const n of list) {
      n.path = prefix ? `${prefix}/${n.name}` : n.name;
      n.depth = depth;
      walk(n.children, n.path, depth + 1);
    }
  };
  walk(roots, "", 0);
  return roots;
}

/** Depth-first flattening of the tree, e.g. for pickers. */
export function flattenFolderTree(roots: readonly FolderNode[]): FolderNode[] {
  const out: FolderNode[] = [];
  const walk = (list: readonly FolderNode[]) => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(roots);
  return out;
}
