import type { ItemDetail } from "@magpie/shared/api";
import { useState } from "react";
import { FlatList, type NativeScrollEvent, type NativeSyntheticEvent, View } from "react-native";
import { Image } from "@/components/styled";
import { Text } from "@/components/ui/text";
import { VideoPlayer } from "@/components/video-player";
import { aspectClass } from "@/lib/media";
import { cn } from "@/lib/utils";

type MediaEntry = ItemDetail["media"][number];

/** Dots shown at once; longer posts get a sliding window like Instagram. */
const MAX_DOTS = 7;

function dotWindow(count: number, index: number): { start: number; end: number } {
  if (count <= MAX_DOTS) return { start: 0, end: count };
  const start = Math.min(Math.max(index - Math.floor(MAX_DOTS / 2), 0), count - MAX_DOTS);
  return { start, end: start + MAX_DOTS };
}

/** Instagram-style pager: every slide uses the first media's frame so the page doesn't jump while swiping. */
export function MediaCarousel({ media, fallbackRatio }: { media: MediaEntry[]; fallbackRatio: number | null }) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);

  const first = media[0];
  const frame = aspectClass(first?.width && first.height ? first.width / first.height : fallbackRatio);
  const many = media.length > 1;

  // Update while dragging so the counter and dots flip at the halfway point, not after the snap settles.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const next = Math.min(Math.max(Math.round(e.nativeEvent.contentOffset.x / width), 0), media.length - 1);
    setIndex((prev) => (prev === next ? prev : next));
  };

  const dots = dotWindow(media.length, index);

  return (
    <View
      className="w-full"
      accessibilityLabel={many ? `Photo ${index + 1} of ${media.length}` : undefined}
      onLayout={(e) => {
        setWidth(e.nativeEvent.layout.width);
      }}
    >
      {width > 0 && (
        <FlatList
          data={media}
          extraData={index}
          horizontal
          pagingEnabled
          bounces={many}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(m) => m.id}
          onScroll={onScroll}
          scrollEventThrottle={16}
          initialNumToRender={1}
          windowSize={3}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          renderItem={({ item: m, index: i }) => (
            // Pager pages need a numeric width; Tailwind can't express a measured value.
            <View style={{ width }} className={cn("bg-black", frame)}>
              {m.type === "video" ? (
                <VideoPlayer url={m.url} aspectClass="h-full" active={i === index} />
              ) : (
                <Image source={{ uri: m.url }} className="h-full w-full" contentFit="contain" transition={150} />
              )}
            </View>
          )}
        />
      )}
      {many && (
        <>
          <View className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1" pointerEvents="none">
            <Text className="text-xs font-medium text-white">
              {index + 1}/{media.length}
            </Text>
          </View>
          <View className="absolute inset-x-0 bottom-3 flex-row items-center justify-center gap-1.5" pointerEvents="none">
            {media.slice(dots.start, dots.end).map((m, k) => {
              const i = dots.start + k;
              const edge = media.length > MAX_DOTS && ((k === 0 && dots.start > 0) || (k === MAX_DOTS - 1 && dots.end < media.length));
              return (
                <View
                  key={m.id}
                  className={cn("rounded-full", edge ? "size-1" : "size-1.5", i === index ? "bg-primary" : "bg-white/50")}
                />
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}
