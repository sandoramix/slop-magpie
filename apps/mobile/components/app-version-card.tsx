import { useRouter } from "expo-router";
import { View } from "react-native";
import { UpdateCard } from "@/components/update-card";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { appVersion } from "@/lib/changelog";
import { useUpdateCheck } from "@/lib/updates";

/** The installed version, whether a newer one exists, and the way to install it. Shown on the Me page. */
export function AppVersionCard() {
  const router = useRouter();
  const update = useUpdateCheck();
  const available = update.data;

  return (
    <View className="gap-2 rounded-xl border border-border bg-card p-4">
      <View className="flex-row items-baseline justify-between">
        <Text className="font-semibold">Magpie {appVersion}</Text>
        <Text className="text-xs text-muted-foreground">
          {update.isFetching ? "Checking for updates…" : update.isError ? "Couldn't check for updates" : available ? `${available.version} is available` : "Up to date"}
        </Text>
      </View>
      {available ? <UpdateCard update={available} /> : null}
      <View className="flex-row gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          disabled={update.isFetching}
          onPress={() => {
            void update.refetch();
          }}
        >
          <Text>Check for updates</Text>
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onPress={() => {
            router.push("/whats-new");
          }}
        >
          <Text>What's new</Text>
        </Button>
      </View>
    </View>
  );
}
