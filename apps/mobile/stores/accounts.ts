import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mmkv, mmkvStorage } from "@/lib/mmkv";

/** A saved server login: URL plus the token kept in secure storage. */
export type Account = { id: string; name: string; url: string; isAdmin: boolean };

/** An admin working inside another account's library. */
export type ActAs = { id: string; name: string };

const tokenKey = (id: string) => `magpie.token.${id}`;
// single-server builds (<= 0.1.3) kept these
const LEGACY_TOKEN_KEY = "magpie.api-token";

type AccountsState = {
  accounts: Account[];
  activeId: string | null;
  /** false until the active token has been read from secure storage. */
  ready: boolean;
  /** Token of the active account, kept in memory only; it is stored in expo-secure-store. */
  token: string | null;
  /** Set while an admin views or edits another account's library; never persisted. */
  actAs: ActAs | null;
  load: () => Promise<void>;
  /** Adds an account (or updates the one with this id) and makes it active. */
  save: (account: { id?: string; name: string; url: string; isAdmin: boolean }, token: string) => Promise<Account>;
  switchTo: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setRole: (id: string, isAdmin: boolean) => void;
  setActAs: (target: ActAs | null) => void;
};

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function hostOf(url: string): string {
  const m = /^https?:\/\/([^/:?#]+)/i.exec(url.trim());
  return m?.[1] ?? "Magpie";
}

/** The URL a single-server build saved in its settings store, if any. */
function legacyUrl(): string | null {
  try {
    const raw = mmkv.getString("settings");
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (typeof parsed !== "object" || parsed === null || !("state" in parsed)) return null;
    const state = parsed.state;
    if (typeof state !== "object" || state === null || !("apiUrl" in state)) return null;
    return typeof state.apiUrl === "string" && state.apiUrl !== "" ? state.apiUrl : null;
  } catch {
    return null;
  }
}

export const useAccounts = create<AccountsState>()(
  persist(
    (set, get) => ({
      accounts: [],
      activeId: null,
      ready: false,
      token: null,
      actAs: null,

      load: async () => {
        let { accounts, activeId } = get();
        if (accounts.length === 0) {
          const url = legacyUrl();
          const token = await SecureStore.getItemAsync(LEGACY_TOKEN_KEY);
          if (url && token) {
            const id = newId();
            await SecureStore.setItemAsync(tokenKey(id), token);
            // the role is looked up from the server after start (GET /me)
            accounts = [{ id, name: hostOf(url), url, isAdmin: false }];
            activeId = id;
            set({ accounts, activeId });
          }
          if (token) await SecureStore.deleteItemAsync(LEGACY_TOKEN_KEY);
        }
        if (activeId !== null && !accounts.some((a) => a.id === activeId)) {
          activeId = accounts[0]?.id ?? null;
          set({ activeId });
        }
        const token = activeId ? await SecureStore.getItemAsync(tokenKey(activeId)) : null;
        set({ ready: true, token });
      },

      save: async ({ id, name, url, isAdmin }, token) => {
        const account: Account = { id: id ?? newId(), name: name.trim() || hostOf(url), url: url.trim().replace(/\/+$/, ""), isAdmin };
        await SecureStore.setItemAsync(tokenKey(account.id), token);
        const known = get().accounts;
        const accounts = known.some((a) => a.id === account.id) ? known.map((a) => (a.id === account.id ? account : a)) : [...known, account];
        set({ accounts, activeId: account.id, token, actAs: null });
        return account;
      },

      switchTo: async (id) => {
        if (!get().accounts.some((a) => a.id === id)) return;
        const token = await SecureStore.getItemAsync(tokenKey(id));
        set({ activeId: id, token, actAs: null });
      },

      remove: async (id) => {
        await SecureStore.deleteItemAsync(tokenKey(id));
        const accounts = get().accounts.filter((a) => a.id !== id);
        if (get().activeId !== id) {
          set({ accounts });
          return;
        }
        const next = accounts[0]?.id ?? null;
        const token = next ? await SecureStore.getItemAsync(tokenKey(next)) : null;
        set({ accounts, activeId: next, token, actAs: null });
      },

      setRole: (id, isAdmin) => {
        const account = get().accounts.find((a) => a.id === id);
        if (!account || account.isAdmin === isAdmin) return;
        set({ accounts: get().accounts.map((a) => (a.id === id ? { ...a, isAdmin } : a)) });
      },

      setActAs: (actAs) => {
        set({ actAs });
      },
    }),
    {
      name: "accounts",
      storage: createJSONStorage(() => mmkvStorage),
      // tokens, the ready flag and act-as are never persisted
      partialize: (s) => ({ accounts: s.accounts, activeId: s.activeId }),
    },
  ),
);

/** Reads an account's token from secure storage (e.g. to sign its session out before removing it). */
export function readToken(id: string): Promise<string | null> {
  return SecureStore.getItemAsync(tokenKey(id));
}

export function useActiveAccount(): Account | null {
  return useAccounts((s) => s.accounts.find((a) => a.id === s.activeId) ?? null);
}

/** True once an account with a loaded token is active. */
export function useHasAccount(): boolean {
  return useAccounts((s) => s.activeId !== null && s.token !== null);
}
