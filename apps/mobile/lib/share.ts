import type { ShareMode } from "@/stores/settings";

/** Set by the "Magpie: save for later" share entry (plugins/with-quick-save-share.ts) in EXTRA_TITLE. */
export const QUICK_SAVE_MARKER = "magpie:later";

/** The share entry that was tapped wins; otherwise the setting decides. */
export function shareModeFor(title: string | undefined, setting: ShareMode): ShareMode {
  return title === QUICK_SAVE_MARKER ? "later" : setting;
}
