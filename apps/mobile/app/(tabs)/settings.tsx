import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { Chip } from "@/components/chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { checkServer } from "@/lib/api";
import { appVersion } from "@/lib/changelog";
import { installLabel, useInstallUpdate } from "@/lib/install-update";
import { useUpdateCheck } from "@/lib/updates";
import { useAuth } from "@/stores/auth";
import { useSettings, type ThemePreference } from "@/stores/settings";

const THEMES: ThemePreference[] = ["system", "light", "dark"];
const COLUMNS = [1, 2, 3] as const;

export default function SettingsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const settings = useSettings();
  const update = useUpdateCheck();
  const available = update.data;
  const install = useInstallUpdate(available);
  const token = useAuth((s) => s.token);
  const setToken = useAuth((s) => s.setToken);
  const [url, setUrl] = useState(settings.apiUrl);
  const [secret, setSecret] = useState(token ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const connect = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const { version } = await checkServer(url, secret.trim());
      settings.setApiUrl(url);
      await setToken(secret.trim());
      await qc.invalidateQueries();
      setStatus(`Connected. Server ${version}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => {
    Alert.alert("Disconnect?", "The token is removed from this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: () => {
          void setToken(null).then(() => {
            setSecret("");
            qc.clear();
            setStatus(null);
          });
        },
      },
    ]);
  };

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-3 p-4" keyboardShouldPersistTaps="handled">
      <Text variant="large">Server</Text>
      <Input
        value={url}
        onChangeText={setUrl}
        placeholder="https://magpie.example.com"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <Input
        value={secret}
        onChangeText={setSecret}
        placeholder="API token"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
      <Button
        disabled={busy || !url.trim() || !secret.trim()}
        onPress={() => {
          void connect();
        }}
      >
        <Text>{busy ? "Checking…" : "Test and save"}</Text>
      </Button>
      {status ? <Text className="text-sm text-muted-foreground">{status}</Text> : null}
      {token ? (
        <Button variant="ghost" onPress={disconnect}>
          <Text className="text-destructive">Disconnect</Text>
        </Button>
      ) : null}

      <Text variant="large" className="mt-4">
        Appearance
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {THEMES.map((t) => (
          <Chip
            key={t}
            label={t.charAt(0).toUpperCase() + t.slice(1)}
            active={settings.theme === t}
            onPress={() => {
              settings.setTheme(t);
            }}
          />
        ))}
      </View>
      <Text className="text-sm text-muted-foreground">Grid columns</Text>
      <View className="flex-row gap-2">
        {COLUMNS.map((c) => (
          <Chip
            key={c}
            label={String(c)}
            active={settings.columns === c}
            onPress={() => {
              settings.setColumns(c);
            }}
          />
        ))}
      </View>

      <Text variant="large" className="mt-4">
        About
      </Text>
      <Text className="text-muted-foreground">Magpie {appVersion}</Text>
      <Text className="text-sm text-muted-foreground">
        {update.isFetching
          ? "Checking for updates…"
          : update.isError
            ? "Couldn't check for updates"
            : update.data
              ? `Version ${update.data.version} is available`
              : "You're up to date"}
      </Text>
      {available ? (
        <Button
          onPress={() => {
            void install.start();
          }}
        >
          <Text>{installLabel(install.state, available.version)}</Text>
        </Button>
      ) : (
        <Button
          variant="outline"
          disabled={update.isFetching}
          onPress={() => {
            void update.refetch();
          }}
        >
          <Text>Check for updates</Text>
        </Button>
      )}
      <Button
        variant="outline"
        onPress={() => {
          router.push("/whats-new");
        }}
      >
        <Text>What's new</Text>
      </Button>
    </ScrollView>
  );
}
