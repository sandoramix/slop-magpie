import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mmkvStorage } from "@/lib/mmkv";

export type ThemePreference = "system" | "light" | "dark";

/** What sharing a link to Magpie does: choose each time, open the item to organize it, or just save it to the Inbox. */
export const shareModes = ["ask", "organize", "later"] as const;
export type ShareMode = (typeof shareModes)[number];

export type ViewMode = "grid" | "list";

type SettingsState = {
  theme: ThemePreference;
  columns: 1 | 2 | 3;
  /** Items as a picture grid or as rows with the title and details beside a small picture. */
  viewMode: ViewMode;
  shareMode: ShareMode;
  lastSeenVersion: string | null;
  setTheme: (theme: ThemePreference) => void;
  setShareMode: (mode: ShareMode) => void;
  setColumns: (columns: 1 | 2 | 3) => void;
  setViewMode: (mode: ViewMode) => void;
  setLastSeenVersion: (version: string) => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "system",
      columns: 2,
      viewMode: "grid",
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
      setViewMode: (viewMode) => {
        set({ viewMode });
      },
      setLastSeenVersion: (lastSeenVersion) => {
        set({ lastSeenVersion });
      },
    }),
    { name: "settings", storage: createJSONStorage(() => mmkvStorage) },
  ),
);
