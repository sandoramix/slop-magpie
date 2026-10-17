import { useVideoPlayer } from "expo-video";
import { useEffect } from "react";
import { VideoView } from "@/components/styled";
import { cn } from "@/lib/utils";

/** `active={false}` pauses playback, e.g. when the slide is swiped away. */
export function VideoPlayer({ url, aspectClass, active = true }: { url: string; aspectClass: string; active?: boolean }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  useEffect(() => {
    if (!active) player.pause();
  }, [active, player]);
  return <VideoView player={player} nativeControls contentFit="contain" className={cn("w-full bg-black", aspectClass)} />;
}
