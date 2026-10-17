import { View } from "react-native";
import { cn } from "@/lib/utils";

// NativeWind has no dynamic widths and styles must be classes, so the bar moves in 5% steps through
// literal class names (Tailwind only generates classes it can see written out).
const FILL = [
  "w-[0%]", "w-[5%]", "w-[10%]", "w-[15%]", "w-[20%]", "w-[25%]", "w-[30%]", "w-[35%]", "w-[40%]", "w-[45%]", "w-[50%]",
  "w-[55%]", "w-[60%]", "w-[65%]", "w-[70%]", "w-[75%]", "w-[80%]", "w-[85%]", "w-[90%]", "w-[95%]", "w-[100%]",
] as const;

/** Defaults suit the primary-coloured update banner; pass classes for other backgrounds. */
export function ProgressBar({ fraction, trackClassName, fillClassName }: { fraction: number; trackClassName?: string; fillClassName?: string }) {
  const step = Math.min(FILL.length - 1, Math.max(0, Math.round(fraction * 20)));
  return (
    <View className={cn("h-2 w-full overflow-hidden rounded-full", trackClassName ?? "bg-primary-foreground/30")}>
      <View className={cn("h-2 rounded-full", fillClassName ?? "bg-primary-foreground", FILL[step])} />
    </View>
  );
}
