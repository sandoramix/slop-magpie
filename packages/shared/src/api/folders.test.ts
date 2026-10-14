import { describe, expect, it } from "vitest";
import { buildFolderTree, flattenFolderTree, type Folder } from "./folders.ts";

const f = (id: string, parentId: string | null, name: string, position = 0): Folder => ({
  id,
  parentId,
  name,
  position,
  icon: null,
  color: null,
  itemCount: 0,
});

describe("buildFolderTree", () => {
  it("nests, orders and computes paths", () => {
    const tree = buildFolderTree([
      f("00000000-0000-0000-0000-000000000003", "00000000-0000-0000-0000-000000000001", "Primi"),
      f("00000000-0000-0000-0000-000000000001", null, "Ricette", 1),
      f("00000000-0000-0000-0000-000000000002", null, "Viaggi", 0),
    ]);
    expect(tree.map((n) => n.name)).toEqual(["Viaggi", "Ricette"]);
    expect(flattenFolderTree(tree).map((n) => [n.path, n.depth])).toEqual([
      ["Viaggi", 0],
      ["Ricette", 0],
      ["Ricette/Primi", 1],
    ]);
  });
});
