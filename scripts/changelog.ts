// CHANGELOG.md tooling. Runs with plain `node` (Node 24 strips types), no dependencies.
// apps/mobile/app.config.ts runs `json` to embed the changelog in the app.
//
//   node scripts/changelog.ts check <version>     exit 1 unless the version has a non-empty entry
//   node scripts/changelog.ts notes <version>     print the entry body (release notes markdown)
//   node scripts/changelog.ts release <version>   move [Unreleased] to [<version>] - <today>
//   node scripts/changelog.ts json                print all entries as JSON

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const UNRELEASED = "Unreleased";

export type ChangelogSection = { title: string; items: string[] };
export type ChangelogEntry = {
  version: string;
  date: string | null;
  sections: ChangelogSection[];
  body: string;
};

const SEMVER = /^\d+\.\d+\.\d+$/;
const ENTRY_HEADING = /^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?\s*$/;
const SECTION_HEADING = /^### (.+?)\s*$/;

export const CHANGELOG_PATH = fileURLToPath(new URL("../CHANGELOG.md", import.meta.url));

export function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let entry: ChangelogEntry | undefined;
  let bodyLines: string[] = [];

  const close = (): void => {
    if (entry) entry.body = bodyLines.join("\n").trim();
  };

  for (const line of markdown.split(/\r?\n/)) {
    const heading = ENTRY_HEADING.exec(line);
    if (heading) {
      close();
      entry = { version: heading[1] ?? "", date: heading[2] ?? null, sections: [], body: "" };
      bodyLines = [];
      entries.push(entry);
      continue;
    }
    if (!entry) continue;
    bodyLines.push(line);

    const section = SECTION_HEADING.exec(line);
    if (section) {
      entry.sections.push({ title: section[1] ?? "", items: [] });
      continue;
    }
    const current = entry.sections.at(-1);
    if (!current) continue;
    if (line.startsWith("- ")) {
      current.items.push(line.slice(2).trim());
    } else if (/^\s+\S/.test(line)) {
      // wrapped bullet
      const last = current.items.pop();
      if (last !== undefined) current.items.push(`${last} ${line.trim()}`);
    }
  }
  close();
  return entries;
}

export function readChangelog(path: string = CHANGELOG_PATH): ChangelogEntry[] {
  return parseChangelog(readFileSync(path, "utf8"));
}

function hasItems(entry: ChangelogEntry): boolean {
  return entry.sections.some((s) => s.items.length > 0);
}

function findEntry(entries: ChangelogEntry[], version: string): ChangelogEntry {
  const entry = entries.find((e) => e.version === version);
  if (!entry) throw new Error(`CHANGELOG.md has no entry for [${version}]`);
  if (!hasItems(entry)) throw new Error(`CHANGELOG.md entry [${version}] is empty`);
  return entry;
}

function promoteUnreleased(markdown: string, version: string, date: string): string {
  if (new RegExp(`^## \\[${version.replaceAll(".", "\\.")}\\]`, "m").test(markdown)) {
    throw new Error(`CHANGELOG.md already has an entry for [${version}]`);
  }
  const unreleased = parseChangelog(markdown).find((e) => e.version === UNRELEASED);
  if (!unreleased || !hasItems(unreleased)) {
    throw new Error("CHANGELOG.md [Unreleased] is missing or empty; nothing to release");
  }
  return markdown.replace(/^## \[Unreleased\]\s*$/m, `## [${UNRELEASED}]\n\n## [${version}] - ${date}`);
}

function requireVersion(value: string | undefined): string {
  if (!value || !SEMVER.test(value)) throw new Error(`expected a <major>.<minor>.<patch> version, got "${value ?? ""}"`);
  return value;
}

function main(argv: string[]): void {
  const [command, arg] = argv;
  switch (command) {
    case "check":
      findEntry(readChangelog(), requireVersion(arg));
      return;
    case "notes":
      process.stdout.write(`${findEntry(readChangelog(), requireVersion(arg)).body}\n`);
      return;
    case "release": {
      const today = new Date().toISOString().slice(0, 10);
      const markdown = readFileSync(CHANGELOG_PATH, "utf8");
      writeFileSync(CHANGELOG_PATH, promoteUnreleased(markdown, requireVersion(arg), today));
      return;
    }
    case "json":
      process.stdout.write(`${JSON.stringify(readChangelog(), null, 2)}\n`);
      return;
    default:
      throw new Error("usage: node scripts/changelog.ts <check|notes|release> <version> | json");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
