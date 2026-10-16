import { useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import { z } from "zod";
import { appVersion, compareVersions } from "./changelog";

const Release = z.object({
  tag_name: z.string(),
  html_url: z.string(),
  body: z.string().nullable().optional(),
  assets: z.array(z.object({ name: z.string(), browser_download_url: z.string() })),
});

const repo = z.string().safeParse(Constants.expoConfig?.extra?.githubRepo);

export type UpdateInfo = {
  version: string;
  notes: string;
  /** Direct link to the release APK. */
  url: string;
};

/** Latest GitHub release if it is newer than the installed build, else null. */
async function fetchUpdate(): Promise<UpdateInfo | null> {
  if (!repo.success) return null;
  const res = await fetch(`https://api.github.com/repos/${repo.data}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  // no release yet (404) or a private repo: nothing to offer
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  const release = Release.parse(await res.json());
  const version = release.tag_name.replace(/^v/, "");
  if (compareVersions(version, appVersion) <= 0) return null;
  // the release is created before CI attaches the APK; until it is there there is nothing to install
  // in place, and sending people to the release page is exactly what the in-app update avoids
  const apk = release.assets.find((a) => a.name.endsWith(".apk"));
  if (!apk) return null;
  return { version, notes: release.body ?? "", url: apk.browser_download_url };
}

export function useUpdateCheck() {
  return useQuery({
    queryKey: ["app-update", appVersion],
    queryFn: fetchUpdate,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
}
