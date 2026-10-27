import type { FeedbackReason, FeedbackSummary, FeedbackVerdict, Notification } from "@magpie/shared/api";
import { Meh, ThumbsDown, ThumbsUp, type LucideIcon } from "lucide-react-native";

export const VERDICT_META: Record<FeedbackVerdict, { label: string; icon: LucideIcon }> = {
  worked: { label: "Worked", icon: ThumbsUp },
  meh: { label: "Meh", icon: Meh },
  failed: { label: "Didn't work", icon: ThumbsDown },
};

export const VERDICT_ORDER: FeedbackVerdict[] = ["worked", "meh", "failed"];

export const REASON_LABELS: Record<FeedbackReason, string> = {
  easy: "Easy",
  useful: "Useful",
  inspiring: "Inspiring",
  too_hard: "Too hard",
  too_long: "Too long",
  outdated: "Outdated",
  not_as_described: "Not as described",
  broken: "Broken",
};

export const REASON_ORDER: FeedbackReason[] = ["easy", "useful", "inspiring", "too_hard", "too_long", "outdated", "not_as_described", "broken"];

/** "Worked for 82% of 31", or null before the first answer. */
export function feedbackLine(f: FeedbackSummary): string | null {
  if (f.total === 0) return null;
  return `Worked for ${Math.round((f.worked / f.total) * 100)}% of ${f.total}`;
}

export function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

export function notificationText(n: Notification): string {
  const title = n.payload.title ? `"${n.payload.title}"` : "a post";
  const who = n.payload.person ? `@${n.payload.person}` : "Someone";
  switch (n.type) {
    case "post_removed":
      return `${who} deleted ${title}. It is gone from your saved posts.`;
    case "post_unshared":
      return `${who} made ${title} private again. It is gone from your saved posts.`;
    case "new_follower":
      return `${who} started following you.`;
    case "post_saved":
      return `${who} saved ${title}.`;
    case "feedback_received":
      return `${title} got feedback: ${n.payload.verdict ?? "an answer"}.`;
  }
}
