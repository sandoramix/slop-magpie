import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mmkvStorage } from "@/lib/mmkv";

export type ThemePreference = "system" | "light" | "dark";

/** What sharing a link to Magpie does: choose each time, open the item to organize it, or just save it to the Inbox. */
export const shareModes = ["ask", "organize", "later"] as const;
export type ShareMode = (typeof shareModes)[number];

type SettingsState = {
  theme: ThemePreference;
  columns: 1 | 2 | 3;
  shareMode: ShareMode;
  lastSeenVersion: string | null;
  setTheme: (theme: ThemePreference) => void;
  setShareMode: (mode: ShareMode) => void;
  setColumns: (columns: 1 | 2 | 3) => void;
  setLastSeenVersion: (version: string) => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "system",
      columns: 2,
      shareMode: "organize",
      lastSeenVersion: null,
      setTheme: (theme) => {
        set({ theme });
      },
      setShareMode: (shareMode) => {
        set({ shareMode });
      },
      setColumns: (columns) => {
        set({ columns });
      },
      setLastSeenVersion: (lastSeenVersion) => {
        set({ lastSeenVersion });
      },
    }),
    { name: "settings", storage: createJSONStorage(() => mmkvStorage) },
  ),
);
