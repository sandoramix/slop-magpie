import type { PostSummary } from "@magpie/shared/api";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, View } from "react-native";
import { Chip } from "@/components/chip";
import { PostGrid } from "@/components/post-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { alert } from "@/lib/alert";
import { VERDICT_META, VERDICT_ORDER } from "@/lib/social";
import { type DiscoverMode, useDiscover, useFeedbackPrompts, usePeopleSearch, usePostActions } from "@/lib/social-queries";

type Mode = DiscoverMode | "people";

const MODES: { key: Mode; label: string }[] = [
  { key: "following", label: "Following" },
  { key: "recent", label: "New" },
  { key: "popular", label: "Popular" },
  { key: "people", label: "People" },
];

/** "How did it go?" for something saved a few days ago: one tap, or later. */
function PromptCard({ post }: { post: PostSummary }) {
  const router = useRouter();
  const actions = usePostActions(post.id);
  const fail = (e: Error) => {
    alert("Failed", e.message);
  };
  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-4">
      <Text className="text-xs font-semibold uppercase text-muted-foreground">How did it go?</Text>
      <Pressable
        onPress={() => {
          router.push({ pathname: post.mine ? "/item/[id]" : "/post/[id]", params: { id: post.id } });
        }}
      >
        <Text className="font-medium" numberOfLines={2}>
          {post.title ?? `Post by @${post.owner.name}`}
        </Text>
      </Pressable>
      <View className="flex-row gap-2">
        {VERDICT_ORDER.map((v) => (
          <Button
            key={v}
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={actions.feedback.isPending}
            onPress={() => {
              actions.feedback.mutate({ verdict: v, reasons: [] }, { onError: fail });
            }}
          >
            <Text>{VERDICT_META[v].label}</Text>
          </Button>
        ))}
      </View>
      <Button
        variant="ghost"
        size="sm"
        onPress={() => {
          actions.snooze.mutate(undefined, { onError: fail });
        }}
      >
        <Text>Not yet</Text>
      </Button>
    </View>
  );
}

export default function ExploreScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("recent");
  const [q, setQ] = useState("");
  const discover = useDiscover(mode === "people" ? "recent" : mode, q);
  const people = usePeopleSearch(mode === "people" ? q : "");
  const prompts = useFeedbackPrompts();
  const posts = discover.data?.pages.flatMap((p) => p.posts) ?? [];

  const header = (
    <View className="gap-3 p-3">
      {(prompts.data ?? []).slice(0, 1).map((p) => (
        <PromptCard key={p.id} post={p} />
      ))}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2" className="grow-0">
        {MODES.map((m) => (
          <Chip
            key={m.key}
            label={m.label}
            active={mode === m.key}
            onPress={() => {
              setMode(m.key);
            }}
          />
        ))}
      </ScrollView>
      {mode !== "following" && <Input value={q} onChangeText={setQ} placeholder={mode === "people" ? "Find people" : "Search posts"} autoCapitalize="none" />}
    </View>
  );

  if (mode === "people") {
    return (
      <View className="flex-1 bg-background">
        <FlatList
          data={people.data ?? []}
          keyExtractor={(p) => p.id}
          ListHeaderComponent={header}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                router.push({ pathname: "/profile/[name]", params: { name: item.name } });
              }}
              className="flex-row items-center gap-3 border-b border-border px-4 py-3"
            >
              <View className="flex-1">
                <Text className="font-medium">{item.displayName ?? item.name}</Text>
                <Text className="text-xs text-muted-foreground">
                  @{item.name} · {item.postCount} posts · {item.followerCount} followers
                </Text>
              </View>
              {item.followedByMe ? <Text className="text-xs text-primary">Following</Text> : null}
            </Pressable>
          )}
          ListEmptyComponent={
            people.isFetching ? (
              <ActivityIndicator className="py-12" />
            ) : (
              <View className="items-center px-8 py-16">
                <Text className="text-center text-muted-foreground">{q.trim() ? "Nobody found." : "Type a name to find people."}</Text>
              </View>
            )
          }
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <PostGrid
        posts={posts}
        header={header}
        empty={mode === "following" ? "Follow people to see their posts here." : q.trim() ? "No posts match." : "Nobody has shared anything yet."}
        refreshing={discover.isRefetching}
        onRefresh={() => {
          void discover.refetch();
          void prompts.refetch();
        }}
        onEndReached={() => {
          if (discover.hasNextPage && !discover.isFetchingNextPage) void discover.fetchNextPage();
        }}
        loadingMore={discover.isFetchingNextPage}
      />
    </View>
  );
}
