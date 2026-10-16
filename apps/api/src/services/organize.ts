// Folders, tags, custom field definitions and smart folders.
import { fieldDefs, folders, itemFolders, items, itemTagSuggestions, itemTags, smartFolders, tags } from "@magpie/db";
import {
  type CreateFieldBody,
  type CreateFolderBody,
  type CreateSmartFolderBody,
  type CreateTagBody,
  type FieldDef,
  type Folder,
  isSelectType,
  type SmartFolder,
  SmartFolderQuery,
  type Tag,
  type UpdateFieldBody,
  type UpdateFolderBody,
  type UpdateSmartFolderBody,
  type UpdateTagBody,
} from "@magpie/shared/api";
import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import type { ServiceDeps } from "../deps.ts";
import { ApiError } from "../http/errors.ts";
import { isUniqueViolation } from "./pg-errors.ts";

type Deps = Pick<ServiceDeps, "db" | "userId">;

const conflictOnDuplicate =
  (message: string) =>
  (error: unknown): never => {
    if (isUniqueViolation(error)) throw new ApiError(409, "conflict", message);
    throw error;
  };

// ── folders ─────────────────────────────────────────────────────────────

export async function listFolders({ db, userId }: Deps): Promise<Folder[]> {
  const counts = db
    .select({ folderId: itemFolders.folderId, n: count().as("n") })
    .from(itemFolders)
    .groupBy(itemFolders.folderId)
    .as("counts");
  const rows = await db
    .select({
      id: folders.id,
      parentId: folders.parentId,
      name: folders.name,
      icon: folders.icon,
      color: folders.color,
      position: folders.position,
      itemCount: sql<number>`coalesce(${counts.n}, 0)::int`,
    })
    .from(folders)
    .leftJoin(counts, eq(counts.folderId, folders.id))
    .where(eq(folders.userId, userId))
    .orderBy(asc(folders.parentId), asc(folders.position), asc(folders.name));
  return rows;
}

async function getFolder(deps: Deps, id: string): Promise<Folder> {
  const folder = (await listFolders(deps)).find((f) => f.id === id);
  if (!folder) throw new ApiError(404, "not_found", "Folder not found");
  return folder;
}

async function assertParent({ db, userId }: Deps, parentId: string | null | undefined) {
  if (!parentId) return;
  const [row] = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.id, parentId), eq(folders.userId, userId)));
  if (!row) throw new ApiError(400, "bad_request", "Unknown parent folder");
}

export async function createFolder(deps: Deps, body: CreateFolderBody): Promise<Folder> {
  const parentId = body.parentId ?? null;
  await assertParent(deps, parentId);
  const [max] = await deps.db
    .select({ p: sql<number | null>`max(${folders.position})` })
    .from(folders)
    .where(and(eq(folders.userId, deps.userId), parentId ? eq(folders.parentId, parentId) : isNull(folders.parentId)));
  const [row] = await deps.db
    .insert(folders)
    .values({ userId: deps.userId, name: body.name, parentId, icon: body.icon ?? null, color: body.color ?? null, position: (max?.p ?? -1) + 1 })
    .returning({ id: folders.id })
    .catch(conflictOnDuplicate("A folder with this name already exists here"));
  if (!row) throw new Error("insert returned no row");
  return getFolder(deps, row.id);
}

/** True when `candidate` is `folderId` or one of its descendants. */
async function isSelfOrDescendant({ db }: Deps, folderId: string, candidate: string): Promise<boolean> {
  const rows = await db.execute<{ found: number }>(sql`
    with recursive sub as (
      select id from folders where id = ${folderId}
      union all
      select f.id from folders f join sub on f.parent_id = sub.id
    )
    select 1 as found from sub where id = ${candidate} limit 1`);
  return rows.length > 0;
}

export async function updateFolder(deps: Deps, id: string, body: UpdateFolderBody): Promise<Folder> {
  await getFolder(deps, id);
  if (body.parentId) {
    await assertParent(deps, body.parentId);
    if (await isSelfOrDescendant(deps, id, body.parentId)) {
      throw new ApiError(400, "bad_request", "A folder cannot be moved into itself or a subfolder");
    }
  }
  const patch: Partial<typeof folders.$inferInsert> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.parentId !== undefined) patch.parentId = body.parentId;
  if (body.icon !== undefined) patch.icon = body.icon;
  if (body.color !== undefined) patch.color = body.color;
  if (body.position !== undefined) patch.position = body.position;
  if (Object.keys(patch).length) {
    await deps.db
      .update(folders)
      .set(patch)
      .where(and(eq(folders.id, id), eq(folders.userId, deps.userId)))
      .catch(conflictOnDuplicate("A folder with this name already exists here"));
  }
  return getFolder(deps, id);
}

/** Deletes the subtree (FK cascade) and its item links, never items. */
export async function deleteFolder({ db, userId }: Deps, id: string): Promise<{ name: string }> {
  const [row] = await db
    .delete(folders)
    .where(and(eq(folders.id, id), eq(folders.userId, userId))).returning({ name: folders.name });
  if (!row) throw new ApiError(404, "not_found", "Folder not found");
  return row;
}

// ── tags ────────────────────────────────────────────────────────────────

export async function listTags({ db, userId }: Deps): Promise<Tag[]> {
  const counts = db.select({ tagId: itemTags.tagId, n: count().as("n") }).from(itemTags).groupBy(itemTags.tagId).as("counts");
  return db
    .select({ id: tags.id, name: tags.name, color: tags.color, itemCount: sql<number>`coalesce(${counts.n}, 0)::int` })
    .from(tags)
    .leftJoin(counts, eq(counts.tagId, tags.id))
    .where(eq(tags.userId, userId))
    .orderBy(sql`lower(${tags.name})`);
}

async function getTag(deps: Deps, id: string): Promise<Tag> {
  const tag = (await listTags(deps)).find((t) => t.id === id);
  if (!tag) throw new ApiError(404, "not_found", "Tag not found");
  return tag;
}

export async function createTag(deps: Deps, body: CreateTagBody): Promise<Tag> {
  const [row] = await deps.db
    .insert(tags)
    .values({ userId: deps.userId, name: body.name, color: body.color ?? null })
    .returning({ id: tags.id })
    .catch(conflictOnDuplicate("A tag with this name already exists"));
  if (!row) throw new Error("insert returned no row");
  return getTag(deps, row.id);
}

export async function updateTag(deps: Deps, id: string, body: UpdateTagBody): Promise<Tag> {
  await getTag(deps, id);
  const patch: Partial<typeof tags.$inferInsert> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.color !== undefined) patch.color = body.color;
  if (Object.keys(patch).length) {
    await deps.db
      .update(tags)
      .set(patch)
      .where(and(eq(tags.id, id), eq(tags.userId, deps.userId))).catch(conflictOnDuplicate("A tag with this name already exists"));
  }
  return getTag(deps, id);
}

export async function deleteTag({ db, userId }: Deps, id: string): Promise<{ name: string }> {
  const [row] = await db
    .delete(tags)
    .where(and(eq(tags.id, id), eq(tags.userId, userId))).returning({ name: tags.name });
  if (!row) throw new ApiError(404, "not_found", "Tag not found");
  return row;
}

/** Moves links (and pending suggestions) to `intoId`, then deletes `id`. */
export async function mergeTag(deps: Deps, id: string, intoId: string): Promise<Tag> {
  if (id === intoId) throw new ApiError(400, "bad_request", "Cannot merge a tag into itself");
  await getTag(deps, id);
  await getTag(deps, intoId);
  await deps.db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into item_tags (item_id, tag_id, assigned_by, confidence, added_at)
      select item_id, ${intoId}, assigned_by, confidence, added_at from item_tags where tag_id = ${id}
      on conflict do nothing`);
    await tx.execute(sql`
      insert into item_tag_suggestions (item_id, tag_id, confidence, created_at)
      select s.item_id, ${intoId}, s.confidence, s.created_at from item_tag_suggestions s
      where s.tag_id = ${id} and not exists (select 1 from item_tags t where t.item_id = s.item_id and t.tag_id = ${intoId})
      on conflict do nothing`);
    await tx.delete(itemTagSuggestions).where(eq(itemTagSuggestions.tagId, id));
    await tx.delete(tags).where(eq(tags.id, id));
  });
  return getTag(deps, intoId);
}

// ── custom fields ───────────────────────────────────────────────────────

export async function listFields({ db, userId }: Deps): Promise<FieldDef[]> {
  return db.select().from(fieldDefs).where(eq(fieldDefs.userId, userId)).orderBy(asc(fieldDefs.position), asc(fieldDefs.label));
}

async function getField({ db, userId }: Deps, id: string): Promise<FieldDef> {
  const [row] = await db
    .select()
    .from(fieldDefs)
    .where(and(eq(fieldDefs.id, id), eq(fieldDefs.userId, userId)));
  if (!row) throw new ApiError(404, "not_found", "Field not found");
  return row;
}

export async function createField(deps: Deps, body: CreateFieldBody): Promise<FieldDef> {
  const [max] = await deps.db
    .select({ p: sql<number | null>`max(${fieldDefs.position})` })
    .from(fieldDefs)
    .where(eq(fieldDefs.userId, deps.userId));
  const [row] = await deps.db
    .insert(fieldDefs)
    .values({
      userId: deps.userId,
      key: body.key,
      label: body.label,
      type: body.type,
      options: isSelectType(body.type) ? (body.options ?? []) : null,
      position: (max?.p ?? -1) + 1,
    })
    .returning()
    .catch(conflictOnDuplicate("A field with this key already exists"));
  if (!row) throw new Error("insert returned no row");
  return row;
}

export async function updateField(deps: Deps, id: string, body: UpdateFieldBody): Promise<FieldDef> {
  const current = await getField(deps, id);
  const patch: Partial<typeof fieldDefs.$inferInsert> = {};
  if (body.label !== undefined) patch.label = body.label;
  if (body.position !== undefined) patch.position = body.position;
  if (body.options !== undefined) {
    if (!isSelectType(current.type)) throw new ApiError(400, "bad_request", "Only select fields have options");
    if (body.options.length === 0) throw new ApiError(400, "bad_request", "select fields need options");
    patch.options = body.options;
  }
  if (Object.keys(patch).length) await deps.db.update(fieldDefs).set(patch).where(eq(fieldDefs.id, id));
  return getField(deps, id);
}

/** Removes the definition and the key from every item's `custom`. */
export async function deleteField({ db, userId }: Deps, id: string): Promise<{ key: string }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .delete(fieldDefs)
      .where(and(eq(fieldDefs.id, id), eq(fieldDefs.userId, userId))).returning({ key: fieldDefs.key });
    if (!row) throw new ApiError(404, "not_found", "Field not found");
    await tx
      .update(items)
      .set({ custom: sql`${items.custom} - ${row.key}::text` })
      .where(and(eq(items.userId, userId), sql`${items.custom} -> ${row.key} is not null`));
    return row;
  });
}

// ── smart folders ───────────────────────────────────────────────────────

const toSmartFolder = (row: typeof smartFolders.$inferSelect): SmartFolder => ({
  ...row,
  // stored JSON may predate a schema change; an unreadable query degrades to "everything"
  query: SmartFolderQuery.catch({}).parse(row.query),
});

export async function listSmartFolders({ db, userId }: Deps): Promise<SmartFolder[]> {
  const rows = await db.select().from(smartFolders).where(eq(smartFolders.userId, userId)).orderBy(asc(smartFolders.position), asc(smartFolders.name));
  return rows.map(toSmartFolder);
}

async function getSmartFolder({ db, userId }: Deps, id: string): Promise<SmartFolder> {
  const [row] = await db
    .select()
    .from(smartFolders)
    .where(and(eq(smartFolders.id, id), eq(smartFolders.userId, userId)));
  if (!row) throw new ApiError(404, "not_found", "Smart folder not found");
  return toSmartFolder(row);
}

export async function createSmartFolder({ db, userId }: Deps, body: CreateSmartFolderBody): Promise<SmartFolder> {
  const [max] = await db
    .select({ p: sql<number | null>`max(${smartFolders.position})` })
    .from(smartFolders)
    .where(eq(smartFolders.userId, userId));
  const [row] = await db
    .insert(smartFolders)
    .values({ userId, name: body.name, query: body.query, icon: body.icon ?? null, color: body.color ?? null, position: (max?.p ?? -1) + 1 })
    .returning();
  if (!row) throw new Error("insert returned no row");
  return toSmartFolder(row);
}

export async function updateSmartFolder(deps: Deps, id: string, body: UpdateSmartFolderBody): Promise<SmartFolder> {
  await getSmartFolder(deps, id);
  const patch: Partial<typeof smartFolders.$inferInsert> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.query !== undefined) patch.query = body.query;
  if (body.icon !== undefined) patch.icon = body.icon;
  if (body.color !== undefined) patch.color = body.color;
  if (body.position !== undefined) patch.position = body.position;
  if (Object.keys(patch).length) await deps.db
      .update(smartFolders)
      .set(patch)
      .where(and(eq(smartFolders.id, id), eq(smartFolders.userId, deps.userId)));
  return getSmartFolder(deps, id);
}

export async function deleteSmartFolder({ db, userId }: Deps, id: string): Promise<void> {
  const rows = await db
    .delete(smartFolders)
    .where(and(eq(smartFolders.id, id), eq(smartFolders.userId, userId))).returning({ id: smartFolders.id });
  if (rows.length === 0) throw new ApiError(404, "not_found", "Smart folder not found");
}

