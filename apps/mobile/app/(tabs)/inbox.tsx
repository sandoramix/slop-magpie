import type { ItemFilter } from "@magpie/shared/api";
import { useRouter } from "expo-router";
import { Sparkles } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { ActAsBanner } from "@/components/account-chrome";
import { AutoFiledBanner } from "@/components/auto-filed-banner";
import { Chip } from "@/components/chip";
import { ItemBrowser } from "@/components/item-browser";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { alert } from "@/lib/alert";
import { useRefetchFailed, useRefreshSuggestions, useStats } from "@/lib/queries";

type View_ = "sort" | "suggestions" | "failed" | "gone";

const VIEWS: Record<View_, { label: string; filter: ItemFilter; hint: string; empty: string }> = {
  sort: {
    label: "To sort",
    filter: { workflow: "inbox" },
    hint: "Saved, but you have not given them tags, folders or a purpose yet.",
    empty: "Nothing to sort. Everything is filed.",
  },
  suggestions: {
    label: "Suggestions",
    filter: { hasSuggestions: true },
    hint: "Tags and folders the app proposes for these. Open one to accept or dismiss.",
    empty: "No suggestions waiting.",
  },
  failed: {
    label: "Failed",
    filter: { fetchStatus: "failed" },
    hint: "The download did not work. Retrying often fixes it once the source is reachable again.",
    empty: "No failed downloads.",
  },
  gone: {
    label: "Removed",
    filter: { availability: "gone" },
    hint: "The original post was taken down. Your saved copy is kept.",
    empty: "No removed posts detected.",
  },
};

export default function InboxScreen() {
  const router = useRouter();
  const [view, setView] = useState<View_>("sort");
  const stats = useStats();
  const retryAll = useRefetchFailed();
  const refresh = useRefreshSuggestions();

  const toSort = stats.data?.byWorkflow.inbox ?? 0;
  const count: Record<View_, number | undefined> = {
    sort: toSort,
    suggestions: stats.data?.withSuggestions,
    failed: stats.data?.byFetchStatus.failed,
    gone: stats.data?.gone,
  };

  const confirmRetry = () => {
    alert("Retry all failed?", `${count.failed ?? 0} item(s) are downloaded again, one after the other.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Retry",
        onPress: () => {
          retryAll.mutate(undefined, { onError: (e) => { alert("Failed", e.message); } });
        },
      },
    ]);
  };

  const header = (
    <View className="gap-3 px-3 pb-2">
      <AutoFiledBanner />
      <View className="gap-2 rounded-xl border border-border bg-card p-4">
        <Text className="text-2xl font-bold">{toSort > 0 ? `${toSort} to sort` : "All sorted"}</Text>
        <Text className="text-sm text-muted-foreground">
          {toSort > 0 ? "Go through them one by one: accept the suggested tags and folders, then say what each is for." : "New saves show up here until you file them."}
        </Text>
        <View className="flex-row gap-2">
          <Button
            className="flex-1"
            disabled={toSort === 0}
            onPress={() => {
              router.push("/triage");
            }}
          >
            <Text>Start sorting</Text>
          </Button>
          <Button
            variant="outline"
            disabled={refresh.isPending}
            onPress={() => {
              refresh.mutate(undefined, {
                onSuccess: ({ affected }) => { alert("Refreshing", `New suggestions are being worked out for ${affected} item(s). They appear over the next minutes.`); },
                onError: (e) => { alert("Failed", e.message); },
              });
            }}
          >
            <Icon as={Sparkles} />
            <Text>Refresh suggestions</Text>
          </Button>
        </View>
        <Button
          variant="ghost"
          onPress={() => {
            router.push("/topics");
          }}
        >
          <Text>Find topics in my library</Text>
        </Button>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2" className="grow-0">
        {(Object.keys(VIEWS) as View_[]).map((key) => (
          <Chip
            key={key}
            label={`${VIEWS[key].label}${count[key] ? ` ${count[key]}` : ""}`}
            active={view === key}
            onPress={() => {
              setView(key);
            }}
          />
        ))}
      </ScrollView>
      <Text className="text-xs text-muted-foreground">{VIEWS[view].hint}</Text>
      {view === "failed" && (count.failed ?? 0) > 0 && (
        <Button variant="outline" disabled={retryAll.isPending} onPress={confirmRetry}>
          <Text>Retry all failed</Text>
        </Button>
      )}
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <ActAsBanner />
      <ItemBrowser key={view} query={{ filter: VIEWS[view].filter }} empty={VIEWS[view].empty} header={header} />
    </View>
  );
}
