import { ActivityIndicator, FlatList, View } from "react-native";
import { Image } from "@/components/styled";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { alert } from "@/lib/alert";
import { useAutoFiled, useKeepAutoFiled, useUndoAutoFiled } from "@/lib/organize-queries";

/** Everything the categorizer filed by itself, item by item: keep it or take it back. */
export default function AutoFiledScreen() {
  const pending = useAutoFiled();
  const keep = useKeepAutoFiled();
  const undo = useUndoAutoFiled();
  const fail = (e: Error) => {
    alert("Failed", e.message);
  };

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={pending.data?.entries ?? []}
        keyExtractor={(e) => e.itemId}
        renderItem={({ item }) => (
          <View className="gap-2 border-b border-border px-4 py-3">
            <View className="flex-row gap-3">
              {item.thumbUrl ? (
                <Image source={{ uri: item.thumbUrl }} className="h-16 w-16 rounded-md bg-muted" contentFit="cover" />
              ) : (
                <View className="h-16 w-16 rounded-md bg-muted" />
              )}
              <View className="flex-1 gap-1">
                <Text className="font-medium" numberOfLines={2}>
                  {item.title ?? "Untitled"}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {[...item.folders.map((f) => f.name), ...item.tags.map((t) => `#${t.name}`)].join(" · ")}
                </Text>
              </View>
            </View>
            <View className="flex-row gap-2">
              <Button size="sm" variant="outline" className="flex-1" disabled={undo.isPending} onPress={() => { undo.mutate({ itemIds: [item.itemId] }, { onError: fail }); }}>
                <Text>Undo</Text>
              </Button>
              <Button size="sm" className="flex-1" disabled={keep.isPending} onPress={() => { keep.mutate({ itemIds: [item.itemId] }, { onError: fail }); }}>
                <Text>Keep</Text>
              </Button>
            </View>
          </View>
        )}
        ListEmptyComponent={
          pending.isPending ? (
            <ActivityIndicator className="py-12" />
          ) : (
            <View className="items-center px-8 py-16">
              <Text className="text-center text-muted-foreground">Nothing to review. Items filed automatically show up here for two weeks.</Text>
            </View>
          )
        }
      />
    </View>
  );
}
