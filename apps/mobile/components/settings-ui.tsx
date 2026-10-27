import type { LucideIcon } from "lucide-react-native";
import { ChevronRight } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/** A titled block of settings: small caps heading, then a rounded card holding rows or custom content. */
export function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View className="gap-1.5">
      <Text className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</Text>
      <View className="overflow-hidden rounded-xl border border-border bg-card">{children}</View>
      {hint ? <Text className="px-1 text-xs text-muted-foreground">{hint}</Text> : null}
    </View>
  );
}

/** One tappable line: icon, label, optional value or badge, chevron. Rows in a Section are divided by a hairline. */
export function Row({
  icon,
  label,
  detail,
  badge,
  destructive = false,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  detail?: string | undefined;
  badge?: number | undefined;
  destructive?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="min-h-12 flex-row items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 active:bg-accent">
      <Icon as={icon} size={20} className={destructive ? "text-destructive" : "text-muted-foreground"} />
      <Text className={cn("flex-1", destructive && "text-destructive")}>{label}</Text>
      {detail ? (
        <Text className="max-w-[45%] text-sm text-muted-foreground" numberOfLines={1}>
          {detail}
        </Text>
      ) : null}
      {badge ? (
        <View className="min-w-5 items-center rounded-full bg-primary px-1.5 py-0.5">
          <Text className="text-xs font-semibold text-primary-foreground">{badge > 99 ? "99+" : badge}</Text>
        </View>
      ) : null}
      <Icon as={ChevronRight} size={18} className="text-muted-foreground" />
    </Pressable>
  );
}

/** Free-form content inside a Section, with the same padding as a row. */
export function Panel({ children, className }: { children: React.ReactNode; className?: string | undefined }) {
  return <View className={cn("gap-2 border-b border-border p-4 last:border-b-0", className)}>{children}</View>;
}
