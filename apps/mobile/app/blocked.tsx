import { ActivityIndicator, FlatList, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { alert } from "@/lib/alert";
import { useBlocked, useUnblock } from "@/lib/social-queries";

export default function BlockedScreen() {
  const blocked = useBlocked();
  const unblock = useUnblock();
  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={blocked.data ?? []}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
            <View className="flex-1">
              <Text className="font-medium">{item.displayName ?? item.name}</Text>
              <Text className="text-xs text-muted-foreground">@{item.name}</Text>
            </View>
            <Button
              size="sm"
              variant="outline"
              disabled={unblock.isPending}
              onPress={() => {
                unblock.mutate(item.name, { onError: (e) => { alert("Failed", e.message); } });
              }}
            >
              <Text>Unblock</Text>
            </Button>
          </View>
        )}
        ListEmptyComponent={
          blocked.isPending ? (
            <ActivityIndicator className="py-12" />
          ) : (
            <View className="items-center px-8 py-16">
              <Text className="text-center text-muted-foreground">You have not blocked anyone.</Text>
            </View>
          )
        }
      />
    </View>
  );
}
