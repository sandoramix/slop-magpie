import { create } from "zustand";

export type InstallState =
  | { status: "idle" }
  | { status: "downloading"; received: number; total: number }
  | { status: "installing" }
  | { status: "error"; message: string };

type UpdateInstallStore = {
  state: InstallState;
  set: (state: InstallState) => void;
};

/** One shared install state, so the banner on the Library and the card in Settings show the same progress. */
export const useUpdateInstall = create<UpdateInstallStore>()((set) => ({
  state: { status: "idle" },
  set: (state) => {
    set({ state });
  },
}));
