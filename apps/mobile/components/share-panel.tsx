import type { ItemDetail } from "@magpie/shared/api";
import { Globe, Lock } from "lucide-react-native";
import { View } from "react-native";
import { FeedbackCard } from "@/components/feedback-card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { alert } from "@/lib/alert";
import { useUpdateItem } from "@/lib/queries";
import { usePost, useSaverCount } from "@/lib/social-queries";

/** Publish or hide an item, and for a public one the feedback it has gathered. */
export function SharePanel({ item }: { item: ItemDetail }) {
  const update = useUpdateItem(item.id);
  const isPublic = item.visibility === "public";
  const post = usePost(item.id);
  const savers = useSaverCount(item.id, isPublic);

  const fail = (e: Error) => {
    alert("Failed", e.message);
  };

  const publish = () => {
    update.mutate({ visibility: "public" }, { onError: fail });
  };
  const unpublish = () => {
    const n = savers.data ?? 0;
    alert(
      "Make private again?",
      n > 0
        ? `${n} ${n === 1 ? "person has" : "people have"} saved this. It disappears from their saved posts and they are told. Your own copy stays.`
        : "It disappears from Explore. Your own copy stays.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Make private",
          style: "destructive",
          onPress: () => {
            update.mutate({ visibility: "private" }, { onError: fail });
          },
        },
      ],
    );
  };

  if (item.fetchStatus !== "ready") return null;

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-4">
        <Icon as={isPublic ? Globe : Lock} size={20} className={isPublic ? "text-primary" : "text-muted-foreground"} />
        <View className="flex-1">
          <Text className="font-medium">{isPublic ? "Shared with everyone" : "Only you can see this"}</Text>
          <Text className="text-xs text-muted-foreground">
            {isPublic ? `${post.data?.likeCount ?? 0} likes · ${post.data?.saveCount ?? 0} saves` : "Share it so others can like and save it."}
          </Text>
        </View>
        <Button size="sm" variant={isPublic ? "outline" : "default"} disabled={update.isPending} onPress={isPublic ? unpublish : publish}>
          <Text>{isPublic ? "Make private" : "Share"}</Text>
        </Button>
      </View>
      {isPublic && post.data ? <FeedbackCard post={post.data} /> : null}
    </View>
  );
}
