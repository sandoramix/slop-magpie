import { useVideoPlayer } from "expo-video";
import { VideoView } from "@/components/styled";
import { cn } from "@/lib/utils";

export function VideoPlayer({ url, aspectClass }: { url: string; aspectClass: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  return <VideoView player={player} nativeControls contentFit="contain" className={cn("w-full bg-black", aspectClass)} />;
}
