import type { ItemDetail } from "@magpie/shared/api";
import { X } from "lucide-react-native";
import { useState } from "react";
import { FlatList, type NativeScrollEvent, type NativeSyntheticEvent, Modal, Pressable, useWindowDimensions, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "@/components/styled";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { VideoPlayer } from "@/components/video-player";
import { ZoomableImage } from "@/components/zoomable-image";

type MediaEntry = ItemDetail["media"][number];

/** Full-screen gallery on black: swipe between items, pinch / double-tap to zoom images, back or ✕ to close. */
export function MediaViewer({ media, startIndex, onClose }: { media: MediaEntry[]; startIndex: number; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(startIndex);
  const [zoomed, setZoomed] = useState(false);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.min(Math.max(Math.round(e.nativeEvent.contentOffset.x / width), 0), media.length - 1);
    setIndex((prev) => (prev === next ? prev : next));
  };

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      {/* a Modal is its own native window, so gestures need a root view of their own */}
      <GestureHandlerRootView className="flex-1 bg-black">
        <FlatList
          data={media}
          extraData={index}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(m) => m.id}
          initialScrollIndex={startIndex}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onScroll={onScroll}
          scrollEventThrottle={16}
          windowSize={3}
          renderItem={({ item: m, index: i }) => (
            // pages are sized in pixels, like the pager pages in the carousel
            <View style={{ width, height }} className="items-center justify-center bg-black">
              {m.type === "video" ? (
                <VideoPlayer url={m.url} aspectClass="h-full" active={i === index} />
              ) : (
                <ZoomableImage uri={m.url} width={width} height={height} onZoomChange={i === index ? setZoomed : undefined} />
              )}
            </View>
          )}
        />
        <SafeAreaView edges={["top"]} className="absolute inset-x-0 top-0 flex-row items-center justify-between px-3 pt-2" pointerEvents="box-none">
          {media.length > 1 ? (
            <View className="rounded-full bg-black/60 px-2.5 py-1" pointerEvents="none">
              <Text className="text-xs font-medium text-white">
                {index + 1}/{media.length}
              </Text>
            </View>
          ) : (
            <View />
          )}
          <Pressable accessibilityLabel="Close" hitSlop={12} onPress={onClose} className="rounded-full bg-black/60 p-2">
            <Icon as={X} size={22} className="text-white" />
          </Pressable>
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}
