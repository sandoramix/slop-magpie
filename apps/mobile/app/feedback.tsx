import type { FeedbackEntry, FeedbackVerdict } from "@magpie/shared/api";
import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Chip } from "@/components/chip";
import { Image } from "@/components/styled";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useDashboardFeedback } from "@/lib/social-queries";
import { REASON_LABELS, VERDICT_META, VERDICT_ORDER } from "@/lib/social";

type Tab = "given" | "received";

function Entry({ entry, tab }: { entry: FeedbackEntry; tab: Tab }) {
  const router = useRouter();
  const meta = VERDICT_META[entry.verdict];
  return (
    <Pressable
      onPress={() => {
        // received feedback is on my own posts, which open in the library view
        if (tab === "received") router.push({ pathname: "/item/[id]", params: { id: entry.itemId } });
        else router.push({ pathname: "/post/[id]", params: { id: entry.itemId } });
      }}
      className="flex-row gap-3 border-b border-border px-4 py-3"
    >
      {entry.thumbUrl ? (
        <Image source={{ uri: entry.thumbUrl }} className="h-14 w-14 rounded-md bg-muted" contentFit="cover" />
      ) : (
        <View className="h-14 w-14 rounded-md bg-muted" />
      )}
      <View className="flex-1 gap-1">
        <Text className="text-sm font-medium" numberOfLines={2}>
          {entry.itemTitle ?? "Untitled"}
        </Text>
        <View className="flex-row items-center gap-1.5">
          <Icon as={meta.icon} size={14} className="text-primary" />
          <Text className="text-sm">{meta.label}</Text>
          {entry.by ? <Text className="text-xs text-muted-foreground">from @{entry.by.name}</Text> : null}
        </View>
        {entry.reasons.length > 0 && (
          <Text className="text-xs text-muted-foreground">{entry.reasons.map((r) => REASON_LABELS[r]).join(" · ")}</Text>
        )}
        <Text className="text-xs text-muted-foreground">{new Date(entry.updatedAt).toLocaleDateString()}</Text>
      </View>
    </Pressable>
  );
}

/** All feedback: the answers I gave, and the ones my posts received. A post can deep-link in with `itemId`. */
export default function FeedbackScreen() {
  const params = useLocalSearchParams<{ tab?: string; itemId?: string; verdict?: string }>();
  const router = useRouter();
  const tab: Tab = params.tab === "received" ? "received" : "given";
  const itemId = params.itemId;
  const verdictParam = VERDICT_ORDER.find((v) => v === params.verdict);

  const setParams = (next: { tab?: Tab; verdict?: FeedbackVerdict | undefined; itemId?: string | undefined }) => {
    router.setParams({
      tab: next.tab ?? tab,
      verdict: "verdict" in next ? next.verdict : verdictParam,
      itemId: "itemId" in next ? next.itemId : itemId,
    });
  };

  const query = useDashboardFeedback({ tab, ...(verdictParam ? { verdict: verdictParam } : {}), ...(itemId ? { itemId } : {}) });
  const entries = query.data?.pages.flatMap((p) => p.entries) ?? [];

  const header = (
    <View className="gap-3 p-4">
      <View className="flex-row gap-2">
        <Chip
          label="Given by me"
          active={tab === "given"}
          onPress={() => {
            setParams({ tab: "given" });
          }}
        />
        <Chip
          label="Received on my posts"
          active={tab === "received"}
          onPress={() => {
            setParams({ tab: "received" });
          }}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2" className="grow-0">
        <Chip
          label="Any answer"
          active={!verdictParam}
          onPress={() => {
            setParams({ verdict: undefined });
          }}
        />
        {VERDICT_ORDER.map((v) => (
          <Chip
            key={v}
            label={VERDICT_META[v].label}
            active={verdictParam === v}
            onPress={() => {
              setParams({ verdict: v });
            }}
          />
        ))}
      </ScrollView>
      {itemId ? (
        <View className="flex-row items-center justify-between rounded-lg bg-muted px-3 py-2">
          <Text className="text-sm">Showing one post only</Text>
          <Pressable
            onPress={() => {
              setParams({ itemId: undefined });
            }}
          >
            <Text className="text-sm text-primary">Show all</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <FlashList
        data={entries}
        keyExtractor={(e) => e.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => <Entry entry={item} tab={tab} />}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => {
              void query.refetch();
            }}
          />
        }
        ListEmptyComponent={
          query.isPending ? (
            <ActivityIndicator className="py-12" />
          ) : (
            <View className="items-center px-8 py-16">
              <Text className="text-center text-muted-foreground">
                {tab === "given" ? "You have not answered \"how did it go?\" yet." : "Nobody has answered on your posts yet."}
              </Text>
            </View>
          )
        }
        ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator className="py-6" /> : null}
      />
    </View>
  );
}
