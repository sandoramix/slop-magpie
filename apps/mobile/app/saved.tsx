import { useState } from "react";
import { ScrollView, View } from "react-native";
import { Chip } from "@/components/chip";
import { PostGrid } from "@/components/post-grid";
import { Input } from "@/components/ui/input";
import { useFolders, useTags } from "@/lib/queries";
import { useSavedPosts } from "@/lib/social-queries";

/** Posts saved from other people, filed with your own folders and tags. */
export default function SavedScreen() {
  const folders = useFolders();
  const tags = useTags();
  const [folderId, setFolderId] = useState<string | undefined>();
  const [tagId, setTagId] = useState<string | undefined>();
  const [unfiled, setUnfiled] = useState(false);
  const [q, setQ] = useState("");

  const query = useSavedPosts({
    ...(folderId ? { folderId } : {}),
    ...(tagId ? { tagId } : {}),
    ...(unfiled ? { unfiled: true } : {}),
    ...(q.trim() ? { q: q.trim() } : {}),
  });
  const saves = query.data?.pages.flatMap((p) => p.saves) ?? [];
  const roots = (folders.data ?? []).filter((f) => f.parentId === null);

  const header = (
    <View className="gap-2 p-3">
      <Input value={q} onChangeText={setQ} placeholder="Search saved posts and notes" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2" className="grow-0">
        <Chip
          label="All"
          active={!folderId && !tagId && !unfiled}
          onPress={() => {
            setFolderId(undefined);
            setTagId(undefined);
            setUnfiled(false);
          }}
        />
        <Chip
          label="Not filed"
          active={unfiled}
          onPress={() => {
            setFolderId(undefined);
            setTagId(undefined);
            setUnfiled(true);
          }}
        />
        {roots.map((f) => (
          <Chip
            key={f.id}
            label={f.name}
            active={folderId === f.id}
            onPress={() => {
              setFolderId(folderId === f.id ? undefined : f.id);
              setTagId(undefined);
              setUnfiled(false);
            }}
          />
        ))}
        {(tags.data ?? []).map((t) => (
          <Chip
            key={t.id}
            label={`#${t.name}`}
            active={tagId === t.id}
            onPress={() => {
              setTagId(tagId === t.id ? undefined : t.id);
              setFolderId(undefined);
              setUnfiled(false);
            }}
          />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <PostGrid
        posts={saves}
        header={header}
        empty="Nothing saved here. Tap Save on someone's post in Explore."
        refreshing={query.isRefetching}
        onRefresh={() => {
          void query.refetch();
        }}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        loadingMore={query.isFetchingNextPage}
      />
    </View>
  );
}
