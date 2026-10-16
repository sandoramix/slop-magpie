import type { ItemFilter } from "@magpie/shared/api";
import { Stack, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { ItemBrowser } from "@/components/item-browser";

/** Items of one folder, tag or smart folder. */
export default function ListScreen() {
  const { folderId, tagId, smartFolderId, title } = useLocalSearchParams<{
    folderId?: string;
    tagId?: string;
    smartFolderId?: string;
    title?: string;
  }>();

  const filter: ItemFilter = {
    ...(folderId ? { folderId, includeSubfolders: true } : {}),
    ...(tagId ? { tagIds: [tagId] } : {}),
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: title ?? "Items" }} />
      <ItemBrowser
        query={{ filter, ...(smartFolderId ? { smartFolderId } : {}) }}
        empty="Nothing here yet."
      />
    </View>
  );
}
