import type { AlertButton } from "react-native";
import { create } from "zustand";

/** What the in-app action sheet shows; used where a native alert cannot (Android shows at most 3 buttons). */
export type Sheet = { title: string; message?: string; buttons: AlertButton[]; onDismiss?: () => void };

type DialogState = {
  sheet: Sheet | null;
  show: (sheet: Sheet) => void;
  close: () => void;
};

export const useDialog = create<DialogState>()((set) => ({
  sheet: null,
  show: (sheet) => {
    set({ sheet });
  },
  close: () => {
    set({ sheet: null });
  },
}));
