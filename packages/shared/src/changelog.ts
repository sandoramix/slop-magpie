// Shape of `node scripts/changelog.ts json`, embedded in the app as `extra.changelog`.
import { z } from "zod";

export const ChangelogSection = z.object({
  title: z.string(),
  items: z.array(z.string()),
});
export type ChangelogSection = z.infer<typeof ChangelogSection>;

export const ChangelogEntry = z.object({
  version: z.string(),
  date: z.string().nullable(),
  sections: z.array(ChangelogSection),
  body: z.string(),
});
export type ChangelogEntry = z.infer<typeof ChangelogEntry>;

export const Changelog = z.array(ChangelogEntry);
export type Changelog = z.infer<typeof Changelog>;
