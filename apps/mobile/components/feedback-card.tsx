import type { FeedbackReason, FeedbackVerdict, PostDetail } from "@magpie/shared/api";
import { useRouter } from "expo-router";
import { BarChart3, FlaskConical } from "lucide-react-native";
import { ScrollView, View } from "react-native";
import { Chip } from "@/components/chip";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { alert } from "@/lib/alert";
import { usePostActions } from "@/lib/social-queries";
import { feedbackLine, REASON_LABELS, REASON_ORDER, VERDICT_META, VERDICT_ORDER } from "@/lib/social";

/** Quick "how did it go?" for any post you can see, your own included, plus the way into the dashboard filtered to it. */
export function FeedbackCard({ post }: { post: PostDetail }) {
  const router = useRouter();
  const actions = usePostActions(post.id);
  const mine = post.myFeedback;
  const line = feedbackLine(post.feedback);

  const fail = (e: Error) => {
    alert("Failed", e.message);
  };
  const choose = (verdict: FeedbackVerdict) => {
    actions.feedback.mutate({ verdict, reasons: mine?.reasons ?? [] }, { onError: fail });
  };
  const toggleReason = (reason: FeedbackReason) => {
    if (!mine) return;
    const has = mine.reasons.includes(reason);
    actions.feedback.mutate({ verdict: mine.verdict, reasons: has ? mine.reasons.filter((r) => r !== reason) : [...mine.reasons, reason] }, { onError: fail });
  };

  const ownerReasons = post.mine ? Object.entries(post.feedback.reasons).sort((a, b) => b[1] - a[1]) : [];

  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-4">
      <Text className="text-xs font-semibold uppercase text-muted-foreground">{post.mine ? "Feedback" : "How did it go?"}</Text>

      <Text className="text-sm">
        {line ?? "No feedback yet."}
        {post.feedback.total > 0 ? `  (${post.feedback.worked} worked, ${post.feedback.meh} meh, ${post.feedback.failed} didn't)` : ""}
      </Text>

      {ownerReasons.length > 0 && (
        <View className="flex-row flex-wrap gap-1.5">
          {ownerReasons.map(([reason, n]) => (
            <View key={reason} className="rounded-full bg-muted px-2.5 py-1">
              <Text className="text-xs">
                {(REASON_LABELS as Record<string, string | undefined>)[reason] ?? reason} · {n}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Text className="text-xs text-muted-foreground">{post.mine ? "Your own answer, if you tried it yourself" : "Your answer"}</Text>
      <View className="flex-row gap-2">
        {VERDICT_ORDER.map((v) => (
          <Button
            key={v}
            size="sm"
            className="flex-1"
            variant={mine?.verdict === v ? "default" : "outline"}
            disabled={actions.feedback.isPending}
            onPress={() => {
              choose(v);
            }}
          >
            <Icon as={VERDICT_META[v].icon} size={16} className={mine?.verdict === v ? "text-primary-foreground" : "text-foreground"} />
            <Text>{VERDICT_META[v].label}</Text>
          </Button>
        ))}
      </View>

      {mine && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2" className="grow-0">
            {REASON_ORDER.map((r) => (
              <Chip
                key={r}
                label={REASON_LABELS[r]}
                active={mine.reasons.includes(r)}
                onPress={() => {
                  toggleReason(r);
                }}
              />
            ))}
          </ScrollView>
          <Button
            variant="ghost"
            size="sm"
            onPress={() => {
              actions.clearFeedback.mutate(undefined, { onError: fail });
            }}
          >
            <Text>Remove my answer</Text>
          </Button>
        </>
      )}

      <View className="flex-row gap-2">
        {!mine && (
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            disabled={actions.tried.isPending}
            onPress={() => {
              actions.tried.mutate(!post.triedByMe, { onError: fail });
            }}
          >
            <Icon as={FlaskConical} size={16} />
            <Text>{post.triedByMe ? "Not tried yet" : "I tried it"}</Text>
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onPress={() => {
            router.push({ pathname: "/feedback", params: { tab: post.mine ? "received" : "given", itemId: post.id } });
          }}
        >
          <Icon as={BarChart3} size={16} />
          <Text>See in dashboard</Text>
        </Button>
      </View>
    </View>
  );
}
