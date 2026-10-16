import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

const KEY = "magpie.api-token";

type AuthState = {
  /** false until the token has been read from secure storage. */
  ready: boolean;
  token: string | null;
  load: () => Promise<void>;
  setToken: (token: string | null) => Promise<void>;
};

// Not persisted by zustand on purpose: the token lives in expo-secure-store only.
export const useAuth = create<AuthState>()((set) => ({
  ready: false,
  token: null,
  load: async () => {
    const token = await SecureStore.getItemAsync(KEY);
    set({ ready: true, token });
  },
  setToken: async (token) => {
    if (token) await SecureStore.setItemAsync(KEY, token);
    else await SecureStore.deleteItemAsync(KEY);
    set({ token });
  },
}));
