import "../global.css";

import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from "expo-router";
import { ShareIntentProvider, useShareIntentContext } from "expo-share-intent";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { colorScheme, useColorScheme } from "nativewind";
import { useEffect, useRef } from "react";
import { BackHandler, ToastAndroid } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DialogHost } from "@/components/dialog-host";
import { alert } from "@/lib/alert";
import { appVersion, entriesSince } from "@/lib/changelog";
import { extractUrl } from "@/lib/media";
import { useSaveLink } from "@/lib/queries";
import { shareModeFor } from "@/lib/share";
import { useColors } from "@/lib/theme";
import { hostOf, useAccounts, useHasAccount } from "@/stores/accounts";
import { useSettings } from "@/stores/settings";

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});

/** Saves a link shared from another app: organize it now, or park it in the Inbox (Settings > Sharing). */
function ShareHandler() {
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const save = useSaveLink();
  const ready = useAccounts((s) => s.ready);
  const configured = useHasAccount();
  const handled = useRef(false);

  useEffect(() => {
    if (!hasShareIntent) {
      handled.current = false;
      return;
    }
    if (!ready || handled.current) return;
    handled.current = true;

    const url = shareIntent.webUrl ?? extractUrl(shareIntent.text);
    if (!url) {
      alert("Nothing to save", "The shared content doesn't contain a link.");
      resetShareIntent();
      return;
    }
    if (!configured) {
      alert("Set up Magpie first", "Add your server and token, then share again.");
      resetShareIntent();
      return;
    }
    // "organize" opens the item to file it now; "later" saves it to the Inbox and returns to the app you came from
    const run = (mode: "organize" | "later") => {
      save.mutate(
        { url },
        {
          onSuccess: ({ item }) => {
            resetShareIntent();
            if (mode === "organize") {
              router.push({ pathname: "/item/[id]", params: { id: item.id } });
              return;
            }
            ToastAndroid.show("Saved to your Inbox", ToastAndroid.SHORT);
            BackHandler.exitApp();
          },
          onError: (e) => {
            resetShareIntent();
            alert("Couldn't save", e.message);
          },
        },
      );
    };

    // the "Magpie: save for later" share entry always parks the link; the plain "Magpie" entry follows the setting
    const mode = shareModeFor(shareIntent.meta?.title, useSettings.getState().shareMode);
    if (mode !== "ask") {
      run(mode);
      return;
    }
    alert(
      "Save to Magpie",
      url,
      [
        {
          text: "Organize now",
          onPress: () => {
            run("organize");
          },
        },
        {
          text: "Save for later",
          onPress: () => {
            run("later");
          },
        },
        { text: "Cancel", style: "cancel", onPress: resetShareIntent },
      ],
      { onDismiss: resetShareIntent },
    );
  }, [hasShareIntent, ready, configured, shareIntent, resetShareIntent, router, save]);

  return null;
}

/** An admin deleted an account saved on this phone: it is already removed, so say why. */
function DeletedNotice() {
  const qc = useQueryClient();
  const pending = useAccounts((s) => s.deletedNotices.length);
  const take = useAccounts((s) => s.takeNotice);
  const ready = useAccounts((s) => s.ready);

  useEffect(() => {
    if (!ready || pending === 0) return;
    const notice = take();
    if (!notice) return;
    qc.clear();
    alert("Account deleted", `An administrator deleted your account "${notice.name}" on ${hostOf(notice.url)}. Its library is gone from the server, and the account was removed from this phone.`);
  }, [ready, pending, take, qc]);

  return null;
}

/** After an update, opens "What's new" once. */
function UpdateNotice() {
  const router = useRouter();
  const last = useSettings((s) => s.lastSeenVersion);
  const setLast = useSettings((s) => s.setLastSeenVersion);

  useEffect(() => {
    if (last === appVersion) return;
    // fresh installs have nothing to catch up on
    if (last !== null && entriesSince(last).length > 0) router.push("/whats-new");
    setLast(appVersion);
  }, [last, setLast, router]);

  return null;
}

function Root() {
  const colors = useColors();
  const { colorScheme: scheme } = useColorScheme();
  const theme = useSettings((s) => s.theme);
  const loadAccounts = useAccounts((s) => s.load);
  const ready = useAccounts((s) => s.ready);
  const hasAccount = useHasAccount();

  useEffect(() => {
    colorScheme.set(theme);
  }, [theme]);

  useEffect(() => {
    void loadAccounts().finally(() => {
      void SplashScreen.hideAsync();
    });
  }, [loadAccounts]);

  if (!ready) return null;

  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider
      value={{
        ...base,
        colors: { ...base.colors, background: colors.background, card: colors.background, text: colors.foreground, border: colors.border, primary: colors.primary },
      }}
    >
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <ShareHandler />
      <UpdateNotice />
      <DeletedNotice />
      <DialogHost />
      <Stack screenOptions={{ headerShadowVisible: false }}>
        <Stack.Protected guard={hasAccount}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="item/[id]" options={{ title: "" }} />
          <Stack.Screen name="list" options={{ title: "" }} />
          <Stack.Screen name="add-link" options={{ title: "Add link", presentation: "modal" }} />
          <Stack.Screen name="accounts" options={{ title: "Accounts", presentation: "modal" }} />
          <Stack.Screen name="account-form" options={{ title: "Account", presentation: "modal" }} />
          <Stack.Screen name="admin" options={{ title: "Users" }} />
        </Stack.Protected>
        <Stack.Protected guard={!hasAccount}>
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
        </Stack.Protected>
        {/* reachable with or without an account: it is how a new account arrives */}
        <Stack.Screen name="connect" options={{ title: "Add account", presentation: "modal" }} />
        <Stack.Screen name="whats-new" options={{ title: "What's new", presentation: "modal" }} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView className="flex-1">
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ShareIntentProvider>
            <Root />
          </ShareIntentProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
