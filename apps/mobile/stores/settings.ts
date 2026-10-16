import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { env } from "@/src/env";
import { mmkvStorage } from "@/lib/mmkv";

export type ThemePreference = "system" | "light" | "dark";

type SettingsState = {
  apiUrl: string;
  theme: ThemePreference;
  columns: 1 | 2 | 3;
  lastSeenVersion: string | null;
  setApiUrl: (url: string) => void;
  setTheme: (theme: ThemePreference) => void;
  setColumns: (columns: 1 | 2 | 3) => void;
  setLastSeenVersion: (version: string) => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      apiUrl: env.EXPO_PUBLIC_DEFAULT_API_URL ?? "",
      theme: "system",
      columns: 2,
      lastSeenVersion: null,
      setApiUrl: (apiUrl) => {
        set({ apiUrl: apiUrl.trim().replace(/\/+$/, "") });
      },
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
