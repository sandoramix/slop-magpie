// Search query language for the `q` param (docs/data-model.md#search):
//
//   pasta limone tag:cibo folder:"Ricette/Primi" is:fav status:to_try from:@author
//   source:instagram kind:video saved:>2026-01-01 field:rating>3 -tag:old "exact phrase"
//
// Pure: no I/O, runs in the app too (e.g. to show filter chips).
import { fetchStatuses, itemKinds, type FetchStatus, type ItemKind, type Workflow } from "../api/enums.ts";

/** Half-open date range in UTC: `from` inclusive, `to` exclusive, both `YYYY-MM-DD`. */
export interface DateRange {
  from?: string;
  to?: string;
}

export type FieldOp = "eq" | "gt" | "gte" | "lt" | "lte";

export interface FieldCondition {
  key: string;
  op: FieldOp;
  value: string;
}

export interface ParsedQuery {
  /** Free-text terms; a quoted phrase is one term. */
  terms: string[];
  excludedTerms: string[];
  tags: string[];
  excludedTags: string[];
  /** Folder paths like `Recipes/Pasta`, matched case-insensitively, including subfolders. */
  folders: string[];
  excludedFolders: string[];
  sources: string[];
  excludedSources: string[];
  kinds: ItemKind[];
  excludedKinds: ItemKind[];
  /** Author handles without `@`. */
  authors: string[];
  workflows: Workflow[];
  favorite?: boolean;
  fetchStatus?: FetchStatus;
  gone?: boolean;
  saved: DateRange;
  posted: DateRange;
  fields: FieldCondition[];
  /** Tokens that looked like qualifiers but had invalid values. Shown to the user, otherwise ignored. */
  invalid: string[];
}

export function emptyQuery(): ParsedQuery {
  return {
    terms: [],
    excludedTerms: [],
    tags: [],
    excludedTags: [],
    folders: [],
    excludedFolders: [],
    sources: [],
    excludedSources: [],
    kinds: [],
    excludedKinds: [],
    authors: [],
    workflows: [],
    saved: {},
    posted: {},
    fields: [],
    invalid: [],
  };
}

interface Token {
  negated: boolean;
  key: string | null;
  value: string;
  raw: string;
}

/** Splits on whitespace, keeping `"quoted values"` (also after `key:`) together. */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const re = /(-?)(?:([a-zA-Z_]+):)?(?:"([^"]*)"?|(\S+))/g;
  for (const m of input.matchAll(re)) {
    const [raw, neg = "", key, quoted, bare] = m;
    const value = quoted ?? bare ?? "";
    if (value === "" && key === undefined) continue;
    tokens.push({ negated: neg === "-", key: key?.toLowerCase() ?? null, value, raw });
  }
  return tokens;
}

const WORKFLOW_ALIASES: Record<string, Workflow> = {
  inbox: "inbox",
  to_try: "to_try",
  totry: "to_try",
  todo: "to_try",
  done: "done",
  reference: "reference",
  ref: "reference",
};

const isOneOf = <T extends string>(list: readonly T[], value: string): value is T => (list as readonly string[]).includes(value);

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** `2026`, `2026-03` or `2026-03-15` → [start, end) */
function parsePeriod(text: string): { start: string; end: string } | null {
  const m = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(text);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = m[2] === undefined ? null : Number(m[2]);
  const d = m[3] === undefined ? null : Number(m[3]);
  if (mo !== null && (mo < 1 || mo > 12)) return null;
  const start = new Date(Date.UTC(y, (mo ?? 1) - 1, d ?? 1));
  if (d !== null && start.getUTCDate() !== d) return null;
  const end = new Date(start);
  if (d !== null) end.setUTCDate(end.getUTCDate() + 1);
  else if (mo !== null) end.setUTCMonth(end.getUTCMonth() + 1);
  else end.setUTCFullYear(end.getUTCFullYear() + 1);
  return { start: fmt(start), end: fmt(end) };
}

/** `>2026-01-01`, `<=2026-02`, `2026`, `2026-01..2026-03`, `7d` (last 7 days). */
export function parseDateRange(text: string, now: Date = new Date()): DateRange | null {
  const relative = /^(\d{1,4})([dwmy])$/.exec(text);
  if (relative) {
    const n = Number(relative[1]);
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const unit = relative[2];
    if (unit === "d") from.setUTCDate(from.getUTCDate() - n);
    else if (unit === "w") from.setUTCDate(from.getUTCDate() - 7 * n);
    else if (unit === "m") from.setUTCMonth(from.getUTCMonth() - n);
    else from.setUTCFullYear(from.getUTCFullYear() - n);
    return { from: fmt(from) };
  }
  const range = /^(.+)\.\.(.+)$/.exec(text);
  if (range) {
    const a = parsePeriod(range[1] ?? "");
    const b = parsePeriod(range[2] ?? "");
    return a && b ? { from: a.start, to: b.end } : null;
  }
  const cmp = /^(>=|<=|>|<|=)?(.+)$/.exec(text);
  const period = parsePeriod(cmp?.[2] ?? "");
  if (!period) return null;
  switch (cmp?.[1]) {
    case ">":
      return { from: period.end };
    case ">=":
      return { from: period.start };
    case "<":
      return { to: period.start };
    case "<=":
      return { to: period.end };
    default:
      return { from: period.start, to: period.end };
  }
}

function mergeRange(a: DateRange, b: DateRange): DateRange {
  const from = [a.from, b.from].filter((x) => x !== undefined).sort().at(-1);
  const to = [a.to, b.to].filter((x) => x !== undefined).sort()[0];
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
}

const FIELD_COND = /^([a-z][a-z0-9_]*)(>=|<=|=|>|<)(.+)$/;
const FIELD_OPS: Record<string, FieldOp> = { "=": "eq", ">": "gt", ">=": "gte", "<": "lt", "<=": "lte" };

export function parseQuery(input: string, now: Date = new Date()): ParsedQuery {
  const q = emptyQuery();
  for (const t of tokenize(input)) {
    const value = t.value.trim();
    if (t.key === null) {
      if (value) (t.negated ? q.excludedTerms : q.terms).push(value);
      continue;
    }
    const lower = value.toLowerCase();
    switch (t.key) {
      case "tag":
        (t.negated ? q.excludedTags : q.tags).push(value.replace(/^#/, ""));
        break;
      case "folder":
      case "in":
        (t.negated ? q.excludedFolders : q.folders).push(value.replace(/^\/+|\/+$/g, ""));
        break;
      case "source":
      case "site":
        (t.negated ? q.excludedSources : q.sources).push(lower);
        break;
      case "kind":
      case "type":
        if (isOneOf(itemKinds, lower)) (t.negated ? q.excludedKinds : q.kinds).push(lower);
        else q.invalid.push(t.raw);
        break;
      case "from":
      case "author":
      case "by":
        q.authors.push(value.replace(/^@/, ""));
        break;
      case "status":
      case "workflow": {
        const wf = WORKFLOW_ALIASES[lower.replace(/[- ]/g, "_")];
        if (wf) q.workflows.push(wf);
        else q.invalid.push(t.raw);
        break;
      }
      case "is":
        if (lower === "fav" || lower === "favorite" || lower === "favourite" || lower === "starred") q.favorite = !t.negated;
        else if (lower === "gone" || lower === "deleted") q.gone = !t.negated;
        else if (lower === "available") q.gone = t.negated;
        else if (isOneOf(fetchStatuses, lower)) q.fetchStatus = lower;
        else if (WORKFLOW_ALIASES[lower]) q.workflows.push(WORKFLOW_ALIASES[lower]);
        else q.invalid.push(t.raw);
        break;
      case "saved":
      case "posted": {
        const range = parseDateRange(lower, now);
        if (range) q[t.key] = mergeRange(q[t.key], range);
        else q.invalid.push(t.raw);
        break;
      }
      case "field": {
        const m = FIELD_COND.exec(value);
        const op = m ? FIELD_OPS[m[2] ?? ""] : undefined;
        if (m?.[1] && m[3] && op) q.fields.push({ key: m[1], op, value: m[3] });
        else q.invalid.push(t.raw);
        break;
      }
      default:
        // not a qualifier (e.g. "note:" in a caption, or a URL): search it as text
        (t.negated ? q.excludedTerms : q.terms).push(t.raw.replace(/^-/, ""));
    }
  }
  return q;
}

/** True when the query only contains free text (no qualifiers). */
export function isPlainText(q: ParsedQuery): boolean {
  const lists = [q.tags, q.excludedTags, q.folders, q.excludedFolders, q.sources, q.excludedSources, q.kinds, q.excludedKinds, q.authors, q.workflows, q.fields];
  const flags = [q.favorite, q.fetchStatus, q.gone, q.saved.from, q.saved.to, q.posted.from, q.posted.to];
  return lists.every((l) => l.length === 0) && flags.every((f) => f === undefined);
}
