// ItemFilter + query language → SQL conditions on `items`. See docs/data-model.md#search.
import {
  type Database,
  fieldDefs,
  folders,
  itemFolderSuggestions,
  itemFolders,
  itemKeywords,
  items,
  itemTagSuggestions,
  itemTags,
  tags,
} from "@magpie/db";
import { buildFolderTree, flattenFolderTree, type FieldDef, type ItemFilter } from "@magpie/shared/api";
import { type FieldCondition, type ParsedQuery, parseQuery } from "@magpie/shared/query";
import { and, eq, exists, inArray, ne, not, or, type SQL, sql } from "drizzle-orm";

export interface ItemConditions {
  where: SQL | undefined;
  /** Relevance score, present when the query has free-text terms. */
  rank: SQL<number> | null;
  parsed: ParsedQuery | null;
}

const FALSE = sql`false`;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** `pasta limone` → `pasta <-> limone:*` (phrase, last word as prefix). Null when no word chars. */
export function toTsQuery(term: string): string | null {
  const words = term.toLowerCase().match(/[\p{L}\p{N}_]+/gu);
  if (!words) return null;
  return words.map((w, i) => (i === words.length - 1 ? `${w}:*` : w)).join(" <-> ");
}

function hasKeyword(db: Database, keyword: string) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(itemKeywords)
      .where(and(eq(itemKeywords.itemId, items.id), eq(itemKeywords.keyword, keyword.toLowerCase()))),
  );
}

function hasTagNamed(db: Database, name: string) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(itemTags)
      .innerJoin(tags, eq(tags.id, itemTags.tagId))
      .where(and(eq(itemTags.itemId, items.id), sql`lower(${tags.name}) = ${name.toLowerCase()}`)),
  );
}

function inAnyFolder(db: Database, folderIds: readonly string[]) {
  if (folderIds.length === 0) return FALSE;
  return exists(
    db
      .select({ one: sql`1` })
      .from(itemFolders)
      .where(and(eq(itemFolders.itemId, items.id), inArray(itemFolders.folderId, [...folderIds]))),
  );
}

function termMatch(db: Database, term: string): SQL {
  const tsq = toTsQuery(term);
  const like = `%${escapeLike(term)}%`;
  const parts: SQL[] = [];
  if (tsq) parts.push(sql`${items.searchTsv} @@ to_tsquery('simple', ${tsq})`);
  parts.push(
    hasKeyword(db, term.replace(/^#/, "")),
    hasTagNamed(db, term.replace(/^#/, "")),
    sql`${items.authorHandle} ilike ${like}`,
    sql`${items.authorName} ilike ${like}`,
    // fuzzy fallback (pg_trgm, threshold pg_trgm.word_similarity_threshold = 0.6)
    sql`${term} <% coalesce(${items.title}, '')`,
    sql`${term} <% coalesce(${items.caption}, '')`,
  );
  return sql`(${sql.join(parts, sql` or `)})`;
}

function excludedTermMatch(db: Database, term: string): SQL {
  const tsq = toTsQuery(term);
  const parts: SQL[] = [hasKeyword(db, term)];
  if (tsq) parts.push(sql`${items.searchTsv} @@ to_tsquery('simple', ${tsq})`);
  return sql`not (${sql.join(parts, sql` or `)})`;
}

function rankFor(terms: readonly string[]): SQL<number> | null {
  if (terms.length === 0) return null;
  const tsqs = terms.map(toTsQuery).filter((q): q is string => q !== null);
  const text = terms.join(" ");
  const ts = tsqs.length ? sql`ts_rank(${items.searchTsv}, to_tsquery('simple', ${tsqs.map((q) => `(${q})`).join(" & ")}))` : sql`0`;
  return sql<number>`(${ts} + greatest(word_similarity(${text}, coalesce(${items.title}, '')), word_similarity(${text}, coalesce(${items.caption}, ''))) * 0.5)`;
}

// raw sql params are not serialized by the driver, so pass text and cast
const dayStart = (isoDate: string) => sql`${`${isoDate}T00:00:00Z`}::timestamptz`;

function fieldCondition(cond: FieldCondition, def: Pick<FieldDef, "type"> | undefined): SQL {
  if (!def) return FALSE;
  const value = sql`${items.custom} -> ${cond.key}`;
  const text = sql`${items.custom} ->> ${cond.key}`;
  const op = { eq: sql`=`, gt: sql`>`, gte: sql`>=`, lt: sql`<`, lte: sql`<=` }[cond.op];
  switch (def.type) {
    case "number":
    case "duration": {
      const n = Number(cond.value);
      if (!Number.isFinite(n)) return FALSE;
      return sql`(jsonb_typeof(${value}) = 'number' and (${text})::numeric ${op} ${n})`;
    }
    case "boolean": {
      if (cond.op !== "eq") return FALSE;
      const b = ["true", "yes", "1"].includes(cond.value.toLowerCase());
      return sql`${value} = ${JSON.stringify(b)}::jsonb`;
    }
    case "multiselect":
      if (cond.op !== "eq") return FALSE;
      return sql`exists (select 1 from jsonb_array_elements_text(case when jsonb_typeof(${value}) = 'array' then ${value} else '[]'::jsonb end) v where lower(v) = ${cond.value.toLowerCase()})`;
    case "date":
      return sql`${text} ${op} ${cond.value}`;
    case "text":
      if (cond.op === "eq") return sql`${text} ilike ${`%${escapeLike(cond.value)}%`}`;
      return sql`${text} ${op} ${cond.value}`;
    default:
      if (cond.op === "eq") return sql`lower(${text}) = ${cond.value.toLowerCase()}`;
      return sql`${text} ${op} ${cond.value}`;
  }
}

/** Lazily loaded lookups; most queries need none of them. */
function lookups(db: Database) {
  let folderTree: Promise<ReturnType<typeof flattenFolderTree>> | undefined;
  let fields: Promise<Map<string, Pick<FieldDef, "type">>> | undefined;
  return {
    folders: () =>
      (folderTree ??= db
        .select({
          id: folders.id,
          parentId: folders.parentId,
          name: folders.name,
          icon: folders.icon,
          color: folders.color,
          position: folders.position,
        })
        .from(folders)
        .then((rows) => flattenFolderTree(buildFolderTree(rows.map((r) => ({ ...r, itemCount: 0 })))))),
    fields: () =>
      (fields ??= db
        .select({ key: fieldDefs.key, type: fieldDefs.type })
        .from(fieldDefs)
        .then((rows) => new Map(rows.map((r) => [r.key, r])))),
  };
}

type Lookups = ReturnType<typeof lookups>;

async function subtreeIds(look: Lookups, rootIds: readonly string[]): Promise<string[]> {
  const all = await look.folders();
  const out = new Set<string>(rootIds);
  // flattened depth-first, so parents come before children
  for (const f of all) if (f.parentId && out.has(f.parentId)) out.add(f.id);
  return [...out];
}

async function folderPathIds(look: Lookups, path: string): Promise<string[]> {
  const all = await look.folders();
  const wanted = path.toLowerCase();
  // full path, or a bare folder name anywhere in the tree
  const roots = all.filter((f) => f.path.toLowerCase() === wanted || (!wanted.includes("/") && f.name.toLowerCase() === wanted));
  return subtreeIds(
    look,
    roots.map((f) => f.id),
  );
}

async function queryConditions(db: Database, look: Lookups, q: ParsedQuery): Promise<SQL[]> {
  const out: SQL[] = [];
  for (const t of q.terms) out.push(termMatch(db, t));
  for (const t of q.excludedTerms) out.push(excludedTermMatch(db, t));
  for (const name of q.tags) out.push(hasTagNamed(db, name));
  for (const name of q.excludedTags) out.push(not(hasTagNamed(db, name)));
  for (const path of q.folders) out.push(inAnyFolder(db, await folderPathIds(look, path)));
  for (const path of q.excludedFolders) {
    const ids = await folderPathIds(look, path);
    if (ids.length) out.push(not(inAnyFolder(db, ids)));
  }
  if (q.sources.length) out.push(inArray(items.source, q.sources));
  if (q.excludedSources.length) out.push(not(inArray(items.source, q.excludedSources)));
  if (q.kinds.length) out.push(inArray(items.kind, q.kinds));
  if (q.excludedKinds.length) out.push(not(inArray(items.kind, q.excludedKinds)));
  if (q.authors.length) {
    out.push(
      or(
        ...q.authors.map((a) => or(sql`lower(${items.authorHandle}) = ${a.toLowerCase()}`, sql`${items.authorName} ilike ${`%${escapeLike(a)}%`}`)),
      ) ?? FALSE,
    );
  }
  if (q.workflows.length) out.push(inArray(items.workflow, q.workflows));
  if (q.favorite !== undefined) out.push(eq(items.favorite, q.favorite));
  if (q.fetchStatus) out.push(eq(items.fetchStatus, q.fetchStatus));
  if (q.gone !== undefined) out.push(q.gone ? eq(items.availability, "gone") : ne(items.availability, "gone"));
  if (q.saved.from) out.push(sql`${items.savedAt} >= ${dayStart(q.saved.from)}`);
  if (q.saved.to) out.push(sql`${items.savedAt} < ${dayStart(q.saved.to)}`);
  if (q.posted.from) out.push(sql`${items.postedAt} >= ${dayStart(q.posted.from)}`);
  if (q.posted.to) out.push(sql`${items.postedAt} < ${dayStart(q.posted.to)}`);
  if (q.fields.length) {
    const defs = await look.fields();
    for (const cond of q.fields) out.push(fieldCondition(cond, defs.get(cond.key)));
  }
  return out;
}

async function filterConditions(db: Database, look: Lookups, f: ItemFilter): Promise<SQL[]> {
  const out: SQL[] = [];
  if (f.folderId) {
    const ids = f.includeSubfolders ? await subtreeIds(look, [f.folderId]) : [f.folderId];
    out.push(inAnyFolder(db, ids));
  }
  for (const tagId of f.tagIds ?? []) {
    out.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(itemTags)
          .where(and(eq(itemTags.itemId, items.id), eq(itemTags.tagId, tagId))),
      ),
    );
  }
  if (f.sources?.length) out.push(inArray(items.source, f.sources));
  if (f.kinds?.length) out.push(inArray(items.kind, f.kinds));
  if (f.workflow) out.push(eq(items.workflow, f.workflow));
  if (f.favorite !== undefined) out.push(eq(items.favorite, f.favorite));
  if (f.fetchStatus) out.push(eq(items.fetchStatus, f.fetchStatus));
  if (f.availability) out.push(eq(items.availability, f.availability));
  if (f.hasSuggestions !== undefined) {
    const has = or(
      exists(db.select({ one: sql`1` }).from(itemFolderSuggestions).where(eq(itemFolderSuggestions.itemId, items.id))),
      exists(db.select({ one: sql`1` }).from(itemTagSuggestions).where(eq(itemTagSuggestions.itemId, items.id))),
    );
    if (has) out.push(f.hasSuggestions ? has : not(has));
  }
  return out;
}

/** Builds the WHERE clause for one or more filters (ANDed, e.g. request params + smart folder). */
export async function itemConditions(db: Database, filters: readonly ItemFilter[], now: Date = new Date()): Promise<ItemConditions> {
  const look = lookups(db);
  const all: SQL[] = [];
  const terms: string[] = [];
  let parsed: ParsedQuery | null = null;
  for (const f of filters) {
    all.push(...(await filterConditions(db, look, f)));
    if (f.q?.trim()) {
      const q = parseQuery(f.q, now);
      parsed ??= q;
      terms.push(...q.terms);
      all.push(...(await queryConditions(db, look, q)));
    }
  }
  return { where: all.length ? and(...all) : undefined, rank: rankFor(terms), parsed };
}
