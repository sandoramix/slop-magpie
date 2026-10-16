import { Changelog, type ChangelogEntry } from "@magpie/shared/changelog";
import Constants from "expo-constants";

export const appVersion: string = Constants.expoConfig?.version ?? "0.0.0";

const parsed = Changelog.safeParse(Constants.expoConfig?.extra?.changelog);
/** Bundled at build time (app.config.ts), newest first; works offline. */
export const changelog: ChangelogEntry[] = parsed.success ? parsed.data : [];

function parts(v: string): number[] {
  return v.split(".").map((n) => Number.parseInt(n, 10) || 0);
}

export function compareVersions(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function entriesSince(version: string): ChangelogEntry[] {
  return changelog.filter((e) => compareVersions(e.version, version) > 0 && compareVersions(e.version, appVersion) <= 0);
}
