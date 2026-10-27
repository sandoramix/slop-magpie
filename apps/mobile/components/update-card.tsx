import { useEffect } from "react";
import { Pressable, View } from "react-native";
import { ProgressBar } from "@/components/progress-bar";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { cancelInstall, discardDownload, formatMb, prepareUpdate, startInstall } from "@/lib/install-update";
import type { UpdateInfo } from "@/lib/updates";
import { cn } from "@/lib/utils";
import { useUpdateInstall } from "@/stores/update";

/**
 * "New version" banner: tap to download and install without leaving the app. A finished download is kept, so
 * backing out of the installer, locking the screen or switching apps never means downloading it again.
 */
export function UpdateCard({ update, className }: { update: UpdateInfo; className?: string }) {
  const state = useUpdateInstall((s) => s.state);

  // a copy downloaded earlier is picked up, and files of other versions are cleaned away
  useEffect(() => {
    void prepareUpdate(update);
  }, [update]);

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

      {state.status === "downloading" || state.status === "paused" ? (
        <>
          <Text className="text-sm font-medium text-primary-foreground">
            {state.status === "paused" ? "Paused" : "Downloading"} Magpie {update.version}…
            {state.total > 0 ? ` ${String(Math.round((state.received / state.total) * 100))}%` : ""}
          </Text>
          <ProgressBar fraction={state.total > 0 ? state.received / state.total : 0} />
          <View className="flex-row items-center justify-between">
            <Text className="flex-1 text-xs text-primary-foreground/80">
              {state.status === "paused"
                ? "Continues when you come back to the app."
                : state.total > 0
                  ? `${formatMb(state.received)} of ${formatMb(state.total)}`
                  : "Starting…"}
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

      {state.status === "ready" ? (
        <>
          <Pressable
            onPress={() => {
              void startInstall(update);
            }}
          >
            <Text className="text-sm font-medium text-primary-foreground">Magpie {update.version} is downloaded</Text>
            <Text className="text-xs text-primary-foreground/80">Tap to install. Nothing is downloaded again.</Text>
          </Pressable>
          <Button
            size="sm"
            variant="ghost"
            className="self-start"
            onPress={() => {
              void discardDownload(update);
            }}
          >
            <Text className="text-primary-foreground">Delete download</Text>
          </Button>
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
          <Text className="text-xs text-primary-foreground/80">Tap to try again; a partial download continues where it stopped.</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
