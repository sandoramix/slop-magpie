import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { Linking, Platform } from "react-native";
import { useCallback, useState } from "react";
import type { UpdateInfo } from "./updates";

const APK_MIME = "application/vnd.android.package-archive";
const FLAG_GRANT_READ_URI_PERMISSION = 1;

export type InstallState =
  | { status: "idle" }
  | { status: "downloading"; progress: number }
  | { status: "installing" }
  | { status: "error"; message: string };

/** Downloads the APK into the app cache and hands it to Android's package installer. */
export function useInstallUpdate(update: UpdateInfo | null | undefined) {
  const [state, setState] = useState<InstallState>({ status: "idle" });

  const start = useCallback(async () => {
    if (!update || state.status === "downloading" || state.status === "installing") return;
    // only a release APK can be installed in place; anything else is a page to open
    if (Platform.OS !== "android" || !update.url.endsWith(".apk")) {
      await Linking.openURL(update.url);
      return;
    }
    try {
      setState({ status: "downloading", progress: 0 });
      const target = `${FileSystem.cacheDirectory ?? ""}magpie-${update.version}.apk`;
      await FileSystem.deleteAsync(target, { idempotent: true });
      const download = FileSystem.createDownloadResumable(update.url, target, {}, (p) => {
        if (p.totalBytesExpectedToWrite > 0) {
          setState({ status: "downloading", progress: p.totalBytesWritten / p.totalBytesExpectedToWrite });
        }
      });
      const result = await download.downloadAsync();
      if (!result || result.status !== 200) throw new Error(`Download failed (${result?.status ?? "no response"})`);

      setState({ status: "installing" });
      const contentUri = await FileSystem.getContentUriAsync(result.uri);
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: contentUri,
        flags: FLAG_GRANT_READ_URI_PERMISSION,
        type: APK_MIME,
      });
      setState({ status: "idle" });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Update failed" });
    }
  }, [update, state.status]);

  return { state, start };
}

export function installLabel(state: InstallState, version: string): string {
  switch (state.status) {
    case "downloading":
      return `Downloading… ${Math.round(state.progress * 100)}%`;
    case "installing":
      return "Opening installer…";
    case "error":
      return `${state.message}. Tap to retry`;
    case "idle":
      return `Update to ${version}`;
  }
}
