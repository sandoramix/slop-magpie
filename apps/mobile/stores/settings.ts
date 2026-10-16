import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mmkvStorage } from "@/lib/mmkv";

export type ThemePreference = "system" | "light" | "dark";

type SettingsState = {
  theme: ThemePreference;
  columns: 1 | 2 | 3;
  lastSeenVersion: string | null;
  setTheme: (theme: ThemePreference) => void;
  setColumns: (columns: 1 | 2 | 3) => void;
  setLastSeenVersion: (version: string) => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "system",
      columns: 2,
      lastSeenVersion: null,
      setTheme: (theme) => {
        set({ theme });
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
