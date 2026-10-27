import type { Topic } from "@magpie/shared/api";
import { useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";
import { Chip } from "@/components/chip";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { alert } from "@/lib/alert";
import { useTopics } from "@/lib/organize-queries";
import { useBulk, useCreateFolder } from "@/lib/queries";

const titleCase = (s: string) => s.replace(/(^|\s)\S/g, (c) => c.toUpperCase());

function TopicCard({ topic }: { topic: Topic }) {
  const createFolder = useCreateFolder();
  const bulk = useBulk();
  const busy = createFolder.isPending || bulk.isPending;

  const fileThem = () => {
    const name = titleCase(topic.keywords.slice(0, 2).join(" ") || topic.label);
    alert(`Make a folder "${name}"?`, `${topic.size} item(s) are put in it. You can move them later.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Make folder",
        onPress: () => {
          createFolder.mutate(
            { name },
            {
              onSuccess: (folder) => {
                bulk.mutate({ ids: topic.itemIds, op: { op: "addFolder", folderId: folder.id } }, { onError: (e) => { alert("Failed", e.message); } });
              },
              onError: (e) => {
                alert("Failed", e.message);
              },
            },
          );
        },
      },
    ]);
  };

  return (
    <View className="gap-2 rounded-xl border border-border bg-card p-4">
      <Text className="text-base font-semibold">{titleCase(topic.label)}</Text>
      <Text className="text-sm text-muted-foreground">
        {topic.size} items{topic.unfiledCount > 0 ? `, ${topic.unfiledCount} not filed yet` : ", all filed"}
      </Text>
      <Button size="sm" variant="outline" disabled={busy} onPress={fileThem}>
        <Text>{busy ? "Working…" : "Make a folder from this topic"}</Text>
      </Button>
    </View>
  );
}

/** Groups of items that are about the same thing, found from their meaning vectors. */
export default function TopicsScreen() {
  const [unfiled, setUnfiled] = useState(true);
  const topics = useTopics(unfiled);

  const header = (
    <View className="gap-3 p-4">
      <Text className="text-sm text-muted-foreground">
        Magpie groups your items by what they are about. Turn a group into a folder in one tap.
        {topics.data ? ` ${topics.data.analysed} of ${topics.data.total} items analysed.` : ""}
      </Text>
      <View className="flex-row gap-2">
        <Chip label="Not filed yet" active={unfiled} onPress={() => { setUnfiled(true); }} />
        <Chip label="All topics" active={!unfiled} onPress={() => { setUnfiled(false); }} />
      </View>
      {topics.data && topics.data.analysed < topics.data.total ? (
        <Text className="text-xs text-muted-foreground">Items saved before this feature are analysed after "Refresh suggestions" in the Sort tab.</Text>
      ) : null}
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={topics.data?.topics ?? []}
        keyExtractor={(t) => t.label}
        ListHeaderComponent={header}
        contentContainerClassName="gap-3 px-4 pb-24"
        renderItem={({ item }) => <TopicCard topic={item} />}
        refreshControl={<RefreshControl refreshing={topics.isRefetching} onRefresh={() => { void topics.refetch(); }} />}
        ListEmptyComponent={
          topics.isPending ? (
            <ActivityIndicator className="py-12" />
          ) : (
            <Text className="py-12 text-center text-muted-foreground">{unfiled ? "No unfiled topics found." : "Not enough similar items yet."}</Text>
          )
        }
      />
    </View>
  );
}
