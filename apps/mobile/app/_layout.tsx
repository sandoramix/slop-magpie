import "../global.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from "expo-router";
import { ShareIntentProvider, useShareIntentContext } from "expo-share-intent";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { colorScheme, useColorScheme } from "nativewind";
import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { appVersion, entriesSince } from "@/lib/changelog";
import { extractUrl } from "@/lib/media";
import { useSaveLink } from "@/lib/queries";
import { useColors } from "@/lib/theme";
import { useAccounts, useHasAccount } from "@/stores/accounts";
import { useSettings } from "@/stores/settings";

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});

/** Saves a link shared from another app, then opens the item. */
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
      Alert.alert("Nothing to save", "The shared content doesn't contain a link.");
      resetShareIntent();
      return;
    }
    if (!configured) {
      Alert.alert("Set up Magpie first", "Add your server and token, then share again.");
      resetShareIntent();
      return;
    }
    save.mutate(
      { url },
      {
        onSuccess: ({ item }) => {
          resetShareIntent();
          router.push({ pathname: "/item/[id]", params: { id: item.id } });
        },
        onError: (e) => {
          resetShareIntent();
          Alert.alert("Couldn't save", e.message);
        },
      },
    );
  }, [hasShareIntent, ready, configured, shareIntent, resetShareIntent, router, save]);

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
