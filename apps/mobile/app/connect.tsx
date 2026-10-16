import { accountLabel } from "@magpie/shared/api";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "@/components/styled";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { checkServer } from "@/lib/api";
import { hostOf, useAccounts } from "@/stores/accounts";

/**
 * Opened from an invite link (magpie://connect?url=…&token=…). Nothing is saved until the person
 * confirms, and the server is asked to vouch for the token first.
 */
export default function ConnectScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const save = useAccounts((s) => s.save);
  const { url, token, username } = useLocalSearchParams<{ url?: string; token?: string; username?: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = typeof url === "string" && /^https?:\/\//i.test(url) && typeof token === "string" && token !== "";

  const connect = async () => {
    if (!valid || typeof url !== "string" || typeof token !== "string") return;
    setBusy(true);
    setError(null);
    try {
      const { me } = await checkServer(url, token);
      await save({ name: `${accountLabel(me)} (${hostOf(url)})`, url, isAdmin: me.isAdmin }, token);
      qc.clear();
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-background p-6">
      {valid ? (
        <View className="w-full gap-4">
          <Text variant="h3">Add this account?</Text>
          <View className="gap-1 rounded-lg border border-border p-3">
            <Text className="text-sm text-muted-foreground">Server</Text>
            <Text selectable>{url}</Text>
            {username ? (
              <>
                <Text className="mt-2 text-sm text-muted-foreground">Username</Text>
                <Text>{username}</Text>
              </>
            ) : null}
          </View>
          <Text className="text-xs text-muted-foreground">Only continue if someone you trust sent you this invite.</Text>
          <Button
            disabled={busy}
            onPress={() => {
              void connect();
            }}
          >
            <Text>{busy ? "Connecting…" : "Connect"}</Text>
          </Button>
          <Button
            variant="ghost"
            onPress={() => {
              router.replace("/");
            }}
          >
            <Text>Cancel</Text>
          </Button>
          {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
        </View>
      ) : (
        <View className="w-full gap-4">
          <Text variant="h3">Invalid invite</Text>
          <Text className="text-muted-foreground">This link is missing the server or the token. Ask for a new invite.</Text>
          <Button
            onPress={() => {
              router.replace("/");
            }}
          >
            <Text>Close</Text>
          </Button>
        </View>
      )}
    </SafeAreaView>
  );
}
