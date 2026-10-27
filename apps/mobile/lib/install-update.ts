import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { AppState } from "react-native";
import { z } from "zod";
import { useUpdateInstall } from "@/stores/update";
import { mmkv } from "./mmkv";
import { appVersion, compareVersions } from "./changelog";
import type { UpdateInfo } from "./updates";

const APK_MIME = "application/vnd.android.package-archive";
const FLAG_GRANT_READ_URI_PERMISSION = 1;
const RECORD_KEY = "update-download";

// app storage, not the cache: Android clears the cache when space runs low, which threw the download away
const dir = () => `${FileSystem.documentDirectory ?? ""}updates/`;
const apkPath = (version: string) => `${dir()}magpie-${version}.apk`;

/** What is on disk: a finished file (`bytes`), or a download that was interrupted (`resumeData`). */
const Record_ = z.object({
  version: z.string(),
  url: z.string(),
  bytes: z.number().optional(),
  resumeData: z.string().optional(),
});
type DownloadRecord = z.infer<typeof Record_>;

function readRecord(): DownloadRecord | null {
  try {
    const raw = mmkv.getString(RECORD_KEY);
    const parsed = raw ? Record_.safeParse(JSON.parse(raw)) : null;
    return parsed?.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function writeRecord(record: DownloadRecord | null): void {
  if (record) mmkv.set(RECORD_KEY, JSON.stringify(record));
  else mmkv.remove(RECORD_KEY);
}

let active: FileSystem.DownloadResumable | null = null;
let current: UpdateInfo | null = null;
// set while the app is in the background and the download was paused on purpose
let pausedForBackground = false;
const flags = { cancelled: false };
// a call, so TypeScript does not assume the flag is still false after the awaits
const isCancelled = () => flags.cancelled;
const isPaused = () => pausedForBackground;

const setState = useUpdateInstall.getState().set;

/** The finished file for this version, if it is still there and whole. */
async function readyFile(version: string): Promise<string | null> {
  const record = readRecord();
  if (record?.version !== version || record.bytes === undefined) return null;
  const info = await FileSystem.getInfoAsync(apkPath(version));
  return info.exists && info.size === record.bytes ? info.uri : null;
}

/**
 * Call when an update is known: marks it ready if a whole copy is already on disk (so it is never downloaded
 * twice), and deletes leftovers of other versions, including the one that is installed now.
 */
export async function prepareUpdate(update: UpdateInfo | null): Promise<void> {
  try {
    const names = await FileSystem.readDirectoryAsync(dir()).catch(() => [] as string[]);
    for (const name of names) {
      const version = /^magpie-(.+)\.apk$/.exec(name)?.[1];
      if (version && (version === update?.version ? false : true)) await FileSystem.deleteAsync(`${dir()}${name}`, { idempotent: true });
      else if (version && compareVersions(version, appVersion) <= 0) await FileSystem.deleteAsync(`${dir()}${name}`, { idempotent: true });
    }
    const record = readRecord();
    if (record && (!update || record.version !== update.version)) writeRecord(null);
    if (!update) return;
    current = update;
    const { status } = useUpdateInstall.getState().state;
    if (status === "idle" && (await readyFile(update.version))) setState({ status: "ready" });
  } catch {
    // housekeeping only; the update still works
  }
}

async function launchInstaller(path: string): Promise<void> {
  setState({ status: "installing" });
  const contentUri = await FileSystem.getContentUriAsync(path);
  await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
    data: contentUri,
    flags: FLAG_GRANT_READ_URI_PERMISSION,
    type: APK_MIME,
  });
  // back from the installer without installing (declined, locked, switched away): the file stays for the next tap
  setState({ status: "ready" });
}

/**
 * Installs the release APK. A finished download is kept and reused; an interrupted one resumes where it stopped
 * (also after locking the screen or switching apps). Android always asks the person to confirm an install, and the
 * first time to allow Magpie to install apps.
 */
export async function startInstall(update: UpdateInfo): Promise<void> {
  const { status } = useUpdateInstall.getState().state;
  if (status === "downloading" || status === "installing") return;
  current = update;
  flags.cancelled = false;
  pausedForBackground = false;

  try {
    await FileSystem.makeDirectoryAsync(dir(), { intermediates: true }).catch(() => undefined);

    const whole = await readyFile(update.version);
    if (whole) {
      await launchInstaller(whole);
      return;
    }

    const target = apkPath(update.version);
    const record = readRecord();
    const resumeData = record?.version === update.version ? record.resumeData : undefined;
    if (!resumeData) await FileSystem.deleteAsync(target, { idempotent: true });
    writeRecord({ version: update.version, url: update.url, ...(resumeData ? { resumeData } : {}) });

    setState({ status: "downloading", received: 0, total: 0 });
    const onProgress = (p: FileSystem.DownloadProgressData) => {
      if (!flags.cancelled) setState({ status: "downloading", received: p.totalBytesWritten, total: p.totalBytesExpectedToWrite });
    };
    active = FileSystem.createDownloadResumable(update.url, target, {}, onProgress, resumeData);
    const result = resumeData ? await active.resumeAsync() : await active.downloadAsync();
    active = null;
    if (isCancelled() || isPaused()) return;
    if (!result || (result.status !== 200 && result.status !== 206)) throw new Error(`Download failed (${result?.status ?? "no response"})`);

    const info = await FileSystem.getInfoAsync(target);
    if (!info.exists || info.size === 0) throw new Error("The downloaded file is empty");
    writeRecord({ version: update.version, url: update.url, bytes: info.size });
    await launchInstaller(info.uri);
  } catch (e) {
    active = null;
    if (isCancelled() || isPaused()) return;
    // the partial progress is kept in the record (if any), so "try again" resumes instead of restarting
    setState({ status: "error", message: e instanceof Error ? e.message : "Update failed" });
  }
}

/** Stops a running download and forgets everything downloaded so far. */
export async function cancelInstall(): Promise<void> {
  const { status } = useUpdateInstall.getState().state;
  if (status !== "downloading" && status !== "paused") return;
  flags.cancelled = true;
  const running = active;
  active = null;
  setState({ status: "idle" });
  try {
    await running?.pauseAsync();
  } catch {
    // already finished or failed; nothing left to stop
  }
  writeRecord(null);
  if (current) await FileSystem.deleteAsync(apkPath(current.version), { idempotent: true });
}

/** Deletes a finished download, e.g. to fetch it again. */
export async function discardDownload(update: UpdateInfo): Promise<void> {
  writeRecord(null);
  await FileSystem.deleteAsync(apkPath(update.version), { idempotent: true });
  setState({ status: "idle" });
}

// Android suspends network work when the screen locks or another app comes up. Pause on purpose while away, keep the
// resume data, and carry on when the app is back, so a half-finished download is never lost.
AppState.addEventListener("change", (next) => {
  const { status } = useUpdateInstall.getState().state;
  if (next !== "active" && status === "downloading" && active && current) {
    const running = active;
    const update = current;
    pausedForBackground = true;
    const { received, total } = useUpdateInstall.getState().state as { received: number; total: number };
    setState({ status: "paused", received, total });
    void running
      .pauseAsync()
      .then((saved) => {
        writeRecord({ version: update.version, url: update.url, ...(saved.resumeData ? { resumeData: saved.resumeData } : {}) });
      })
      .catch(() => undefined);
    active = null;
  } else if (next === "active" && status === "paused" && current) {
    void startInstall(current);
  }
});

export function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
