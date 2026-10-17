import type { Storage } from "@magpie/shared/api";
import { View } from "react-native";
import { ProgressBar } from "@/components/progress-bar";
import { Text } from "@/components/ui/text";
import { formatBytes } from "@/lib/media";
import { cn } from "@/lib/utils";

/** Fraction of the limit in use, or null when there is no limit. */
export const storageFraction = (s: Storage): number | null => (s.limitBytes === null ? null : s.usedBytes / s.limitBytes);

/** "12.3 GB of 50 GB" with a bar; the bar turns red when the account is nearly full. */
export function StorageMeter({ storage, compact = false }: { storage: Storage; compact?: boolean }) {
  const fraction = storageFraction(storage);
  const full = fraction !== null && fraction >= 1;
  return (
    <View className="gap-1">
      <Text className={cn(compact ? "text-xs" : "text-sm", full ? "text-destructive" : "text-muted-foreground")}>
        {formatBytes(storage.usedBytes)} {storage.limitBytes === null ? "used · no limit" : `of ${formatBytes(storage.limitBytes)}${full ? " · full" : ""}`}
      </Text>
      {fraction !== null ? (
        <ProgressBar
          fraction={fraction}
          trackClassName="bg-muted"
          fillClassName={fraction >= 0.9 ? "bg-destructive" : "bg-primary"}
        />
      ) : null}
    </View>
  );
}
