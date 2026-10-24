import type { SharedComment } from "@magpie/shared/api";
import { MessageSquare } from "lucide-react-native";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

/** The comment a shared link pointed at, shown with the post it belongs to. */
export function SharedCommentCard({ comment, compact = false }: { comment: SharedComment; compact?: boolean }) {
  const meta = [comment.authorHandle ? `@${comment.authorHandle}` : null, comment.postedAt ? new Date(comment.postedAt).toLocaleDateString() : null, comment.likeCount ? `${comment.likeCount} likes` : null]
    .filter((part): part is string => part !== null)
    .join(" · ");
  return (
    <View className="gap-1 rounded-lg border border-border bg-muted p-3">
      <View className="flex-row items-center gap-1">
        <Icon as={MessageSquare} size={14} className="text-muted-foreground" />
        <Text className="text-xs font-semibold uppercase text-muted-foreground">Shared comment</Text>
      </View>
      {comment.text ? (
        <Text className="text-sm" numberOfLines={compact ? 4 : undefined}>{comment.text}</Text>
      ) : (
        <Text className="text-sm text-muted-foreground">The text is not available yet. If it stays empty, it could not be read or was deleted.</Text>
      )}
      {meta ? <Text className="text-xs text-muted-foreground">{meta}</Text> : null}
    </View>
  );
}
