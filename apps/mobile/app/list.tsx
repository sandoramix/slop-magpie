import type { ItemFilter } from "@magpie/shared/api";
import { Stack, useLocalSearchParams } from "expo-router";
import { ActAsBanner } from "@/components/account-chrome";
import { ItemBrowser } from "@/components/item-browser";
import { SafeAreaView } from "@/components/styled";

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
    // the stack header covers the top; keep content clear of the system navigation bar
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-background">
      <Stack.Screen options={{ title: title ?? "Items" }} />
      <ActAsBanner />
      <ItemBrowser query={{ filter, ...(smartFolderId ? { smartFolderId } : {}) }} empty="Nothing here yet." />
    </SafeAreaView>
  );
}
