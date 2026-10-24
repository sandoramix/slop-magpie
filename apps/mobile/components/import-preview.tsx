import type { ItemDetail } from "@magpie/shared/api";
import { Check, Circle, X } from "lucide-react-native";
import { ActivityIndicator, View } from "react-native";
import { Image } from "@/components/styled";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { SharedCommentCard } from "@/components/shared-comment-card";

type StepState = "done" | "active" | "waiting" | "failed";

function Step({ label, state }: { label: string; state: StepState }) {
  return (
    <View className="flex-row items-center gap-2">
      {state === "active" ? (
        <ActivityIndicator size="small" />
      ) : (
        <Icon
          as={state === "done" ? Check : state === "failed" ? X : Circle}
          size={16}
          className={state === "done" ? "text-primary" : state === "failed" ? "text-destructive" : "text-muted-foreground"}
        />
      )}
      <Text className={state === "waiting" ? "text-sm text-muted-foreground" : "text-sm"}>{label}</Text>
    </View>
  );
}

/** The three stages of an import, as far as the item says. */
export function importSteps(item: ItemDetail): { saved: StepState; download: StepState; preview: StepState } {
  const download: StepState =
    item.fetchStatus === "ready" ? "done" : item.fetchStatus === "failed" ? "failed" : item.fetchStatus === "fetching" ? "active" : "waiting";
  const preview: StepState = download !== "done" ? "waiting" : item.mediaCount > 0 && !item.thumbUrl ? "active" : "done";
  return { saved: "done", download, preview };
}

/** What the server has so far for a link that was just saved: preview picture, title, description, progress. */
export function ImportPreview({ item }: { item: ItemDetail }) {
  const steps = importSteps(item);
  const text = item.title ?? item.caption;
  return (
    <View className="overflow-hidden rounded-xl border border-border bg-card">
      {item.thumbUrl ? (
        <Image source={{ uri: item.thumbUrl }} className="aspect-video w-full bg-muted" contentFit="cover" />
      ) : (
        <View className="aspect-video items-center justify-center bg-muted">
          {steps.download === "failed" ? <Text className="text-sm text-destructive">Download failed</Text> : <ActivityIndicator />}
        </View>
      )}
      <View className="gap-2 p-3">
        {item.authorHandle ? <Text className="text-xs font-medium text-muted-foreground">@{item.authorHandle}</Text> : null}
        {text ? <Text className="text-sm font-medium" numberOfLines={2}>{text}</Text> : null}
        {item.caption && item.title && item.caption !== item.title ? (
          <Text className="text-sm text-muted-foreground" numberOfLines={6}>{item.caption}</Text>
        ) : null}
        {item.sharedComment ? <SharedCommentCard comment={item.sharedComment} compact /> : null}
        <View className="gap-1 pt-1">
          <Step label="Link saved" state={steps.saved} />
          <Step label={steps.download === "failed" ? (item.fetchError ?? "Download failed") : "Downloading"} state={steps.download} />
          <Step label="Preview ready" state={steps.preview} />
        </View>
      </View>
    </View>
  );
}
