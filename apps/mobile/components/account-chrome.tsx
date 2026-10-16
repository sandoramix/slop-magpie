import { useRouter } from "expo-router";
import { ChevronDown, Eye } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useAccounts, useActiveAccount } from "@/stores/accounts";

/** Header title that shows the active account and opens the account list. */
export function AccountTitle({ fallback }: { fallback: string }) {
  const router = useRouter();
  const account = useActiveAccount();
  return (
    <Pressable
      onPress={() => {
        router.push("/accounts");
      }}
      className="flex-row items-center gap-1 py-1"
    >
      <Text className="text-lg font-semibold">{account?.name ?? fallback}</Text>
      <Icon as={ChevronDown} className="text-muted-foreground" />
    </Pressable>
  );
}

/** Shown while an admin works inside another account's library. */
export function ActAsBanner() {
  const actAs = useAccounts((s) => s.actAs);
  const setActAs = useAccounts((s) => s.setActAs);
  if (!actAs) return null;
  return (
    <View className="flex-row items-center gap-2 bg-primary px-3 py-2">
      <Icon as={Eye} size={16} className="text-primary-foreground" />
      <Text className="flex-1 text-sm text-primary-foreground" numberOfLines={1}>
        Viewing {actAs.name}'s library
      </Text>
      <Pressable
        hitSlop={8}
        onPress={() => {
          setActAs(null);
        }}
      >
        <Text className="text-sm font-semibold text-primary-foreground">Exit</Text>
      </Pressable>
    </View>
  );
}
