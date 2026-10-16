import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Check, Plus, Shield } from "lucide-react-native";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "@/components/styled";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { signOutRemote } from "@/lib/api";
import { readToken, useAccounts } from "@/stores/accounts";

/** Saved servers on this device. Tap to switch, long-press to edit or remove. */
export default function AccountsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const accounts = useAccounts((s) => s.accounts);
  const activeId = useAccounts((s) => s.activeId);
  const switchTo = useAccounts((s) => s.switchTo);
  const remove = useAccounts((s) => s.remove);

  const choose = async (id: string) => {
    if (id !== activeId) {
      await switchTo(id);
      qc.clear();
    }
    router.dismissTo("/");
  };

  const options = (id: string, name: string) => {
    Alert.alert(name, undefined, [
      {
        text: "Edit",
        onPress: () => {
          router.push({ pathname: "/account-form", params: { id } });
        },
      },
      {
        text: "Sign out and remove from this device",
        style: "destructive",
        onPress: () => {
          const account = accounts.find((a) => a.id === id);
          void (async () => {
            // a password login is a session on the server; end it so a lost phone leaves nothing behind
            const token = await readToken(id);
            if (account && token) await signOutRemote(account.url, token);
            await remove(id);
            qc.clear();
          })();
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-background">
      <ScrollView contentContainerClassName="p-4 gap-2">
        {accounts.map((a) => (
          <Pressable
            key={a.id}
            onPress={() => {
              void choose(a.id);
            }}
            onLongPress={() => {
              options(a.id, a.name);
            }}
            className="flex-row items-center gap-3 rounded-lg border border-border p-3 active:bg-accent"
          >
            <View className="flex-1">
              <View className="flex-row items-center gap-1.5">
                <Text className="font-medium">{a.name}</Text>
                {a.isAdmin ? <Icon as={Shield} size={14} className="text-muted-foreground" /> : null}
              </View>
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                {a.url}
              </Text>
            </View>
            {a.id === activeId ? <Icon as={Check} className="text-primary" /> : null}
          </Pressable>
        ))}
        <Button
          variant="outline"
          className="mt-2"
          onPress={() => {
            router.push("/account-form");
          }}
        >
          <Icon as={Plus} />
          <Text>Add account</Text>
        </Button>
        <Text className="mt-2 text-center text-xs text-muted-foreground">Long-press an account to edit or remove it.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
