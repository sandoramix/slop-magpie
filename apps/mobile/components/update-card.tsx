import { Pressable, View } from "react-native";
import { ProgressBar } from "@/components/progress-bar";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { cancelInstall, formatMb, startInstall } from "@/lib/install-update";
import type { UpdateInfo } from "@/lib/updates";
import { cn } from "@/lib/utils";
import { useUpdateInstall } from "@/stores/update";

/** "New version" banner: tap to download and install without leaving the app, with a progress bar. */
export function UpdateCard({ update, className }: { update: UpdateInfo; className?: string }) {
  const state = useUpdateInstall((s) => s.state);

  return (
    <View className={cn("gap-2 rounded-lg bg-primary px-3 py-2", className)}>
      {state.status === "idle" ? (
        <Pressable
          onPress={() => {
            void startInstall(update);
          }}
        >
          <Text className="text-sm font-medium text-primary-foreground">Magpie {update.version} is available</Text>
          <Text className="text-xs text-primary-foreground/80">Tap to download and install. Android asks you to confirm at the end.</Text>
        </Pressable>
      ) : null}

      {state.status === "downloading" ? (
        <>
          <Text className="text-sm font-medium text-primary-foreground">
            Downloading Magpie {update.version}…{state.total > 0 ? ` ${String(Math.round((state.received / state.total) * 100))}%` : ""}
          </Text>
          <ProgressBar fraction={state.total > 0 ? state.received / state.total : 0} />
          <View className="flex-row items-center justify-between">
            <Text className="text-xs text-primary-foreground/80">
              {state.total > 0 ? `${formatMb(state.received)} of ${formatMb(state.total)}` : "Starting…"}
            </Text>
            <Button
              size="sm"
              variant="ghost"
              onPress={() => {
                void cancelInstall();
              }}
            >
              <Text className="text-primary-foreground">Cancel</Text>
            </Button>
          </View>
        </>
      ) : null}

      {state.status === "installing" ? (
        <>
          <Text className="text-sm font-medium text-primary-foreground">Opening the installer…</Text>
          <Text className="text-xs text-primary-foreground/80">Confirm the install in the Android prompt. If Android asks, allow Magpie to install apps, then come back and tap again.</Text>
        </>
      ) : null}

      {state.status === "error" ? (
        <Pressable
          onPress={() => {
            void startInstall(update);
          }}
        >
          <Text className="text-sm font-medium text-primary-foreground">{state.message}</Text>
          <Text className="text-xs text-primary-foreground/80">Tap to try again.</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
