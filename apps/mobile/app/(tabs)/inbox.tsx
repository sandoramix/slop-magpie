import type { ItemFilter } from "@magpie/shared/api";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { Chip } from "@/components/chip";
import { ItemBrowser } from "@/components/item-browser";
import { SetupNotice } from "@/components/setup-notice";
import { useStats } from "@/lib/queries";
import { useAuth } from "@/stores/auth";
import { useSettings } from "@/stores/settings";

type View_ = "inbox" | "suggestions" | "failed" | "gone";

const VIEWS: Record<View_, { label: string; filter: ItemFilter; empty: string }> = {
  inbox: { label: "New", filter: { workflow: "inbox" }, empty: "Inbox zero. Everything is sorted." },
  suggestions: {
    label: "Suggestions",
    filter: { hasSuggestions: true },
    empty: "No folder or tag suggestions waiting.",
  },
  failed: { label: "Failed", filter: { fetchStatus: "failed" }, empty: "No failed downloads." },
  gone: { label: "Gone", filter: { availability: "gone" }, empty: "No removed posts detected." },
};

export default function InboxScreen() {
  const hasToken = useAuth((s) => s.token !== null);
  const hasUrl = useSettings((s) => s.apiUrl !== "");
  const [view, setView] = useState<View_>("inbox");
  const stats = useStats();

  if (!hasToken || !hasUrl) return <SetupNotice />;

  const count: Record<View_, number | undefined> = {
    inbox: stats.data?.byWorkflow.inbox,
    suggestions: stats.data?.withSuggestions,
    failed: stats.data?.byFetchStatus.failed,
    gone: stats.data?.gone,
  };

  return (
    <View className="flex-1 bg-background">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-3 py-2" className="grow-0">
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
      <ItemBrowser key={view} query={{ filter: VIEWS[view].filter }} empty={VIEWS[view].empty} />
    </View>
  );
}
