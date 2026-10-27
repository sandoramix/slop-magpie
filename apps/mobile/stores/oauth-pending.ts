import { create } from "zustand";
import type { OAuthProvider } from "@magpie/shared/api";

/**
 * Which server a social login was started against, so the app knows where to take the ticket when the
 * browser returns through `magpie://oauth`. Memory only: if the app was killed meanwhile, the person starts again.
 */
type Pending = { url: string; provider: OAuthProvider } | null;

export const usePendingOAuth = create<{ pending: Pending; set: (p: Pending) => void }>((set) => ({
  pending: null,
  set: (pending) => {
    set({ pending });
  },
}));
