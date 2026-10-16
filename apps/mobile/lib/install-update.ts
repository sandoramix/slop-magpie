import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { useUpdateInstall } from "@/stores/update";
import type { UpdateInfo } from "./updates";

const APK_MIME = "application/vnd.android.package-archive";
const FLAG_GRANT_READ_URI_PERMISSION = 1;

let active: FileSystem.DownloadResumable | null = null;
const flags = { cancelled: false };
// a call, so TypeScript does not assume the flag is still false after the awaits
const isCancelled = () => flags.cancelled;
let targetPath: string | null = null;

const setState = useUpdateInstall.getState().set;

/**
 * Downloads the release APK into the app cache and hands it to Android's package installer. Android
 * always asks the person to confirm an install (and, the first time, to allow Magpie to install
 * apps); everything before that happens inside the app.
 */
export async function startInstall(update: UpdateInfo): Promise<void> {
  const { status } = useUpdateInstall.getState().state;
  if (status === "downloading" || status === "installing") return;

  const target = `${FileSystem.cacheDirectory ?? ""}magpie-${update.version}.apk`;
  flags.cancelled = false;
  targetPath = target;
  try {
    setState({ status: "downloading", received: 0, total: 0 });
    await FileSystem.deleteAsync(target, { idempotent: true });
    active = FileSystem.createDownloadResumable(update.url, target, {}, (p) => {
      if (!flags.cancelled) setState({ status: "downloading", received: p.totalBytesWritten, total: p.totalBytesExpectedToWrite });
    });
    const result = await active.downloadAsync();
    active = null;
    if (isCancelled()) return;
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
    active = null;
    if (!isCancelled()) setState({ status: "error", message: e instanceof Error ? e.message : "Update failed" });
  }
}

/** Stops a running download and removes the partial file. */
export async function cancelInstall(): Promise<void> {
  if (useUpdateInstall.getState().state.status !== "downloading") return;
  flags.cancelled = true;
  const running = active;
  active = null;
  setState({ status: "idle" });
  try {
    await running?.pauseAsync();
  } catch {
    // already finished or failed; nothing left to stop
  }
  if (targetPath) await FileSystem.deleteAsync(targetPath, { idempotent: true });
}

export function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
