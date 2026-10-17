import { useState } from "react";
import { GestureDetector, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Image } from "@/components/styled";

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

type Props = {
  uri: string;
  /** Size of the viewport the image is fitted into. */
  width: number;
  height: number;
  /** Tells the parent pager to stop paging while the image is zoomed in. */
  onZoomChange?: ((zoomed: boolean) => void) | undefined;
};

/** Pinch to zoom, drag to pan while zoomed, double-tap to toggle. The image is fitted into the viewport first. */
export function ZoomableImage({ uri, width, height, onZoomChange }: Props) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  // panning is only switched on while zoomed, so at 1x a horizontal drag still belongs to the pager
  const [zoomed, setZoomed] = useState(false);

  const report = (next: boolean) => {
    setZoomed(next);
    onZoomChange?.(next);
  };

  const limit = (value: number, size: number, s: number) => {
    "worklet";
    const max = (size * (s - 1)) / 2;
    return Math.min(Math.max(value, -max), max);
  };

  const pinch = usePinchGesture({
    onBegin: () => {
      "worklet";
      savedScale.value = scale.value;
    },
    onUpdate: (e) => {
      "worklet";
      // a little give below 1x so the snap-back feels elastic
      scale.value = Math.min(Math.max(savedScale.value * e.scale, 0.8), MAX_SCALE);
      x.value = limit(x.value, width, scale.value);
      y.value = limit(y.value, height, scale.value);
    },
    onDeactivate: () => {
      "worklet";
      if (scale.value <= 1) {
        scale.value = withTiming(1);
        x.value = withTiming(0);
        y.value = withTiming(0);
        scheduleOnRN(report, false);
      } else {
        scheduleOnRN(report, true);
      }
    },
  });

  const pan = usePanGesture({
    enabled: zoomed,
    onBegin: () => {
      "worklet";
      savedX.value = x.value;
      savedY.value = y.value;
    },
    onUpdate: (e) => {
      "worklet";
      x.value = limit(savedX.value + e.translationX, width, scale.value);
      y.value = limit(savedY.value + e.translationY, height, scale.value);
    },
  });

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onDeactivate: (e) => {
      "worklet";
      if (e.canceled) return;
      const zoomIn = scale.value <= 1;
      scale.value = withTiming(zoomIn ? DOUBLE_TAP_SCALE : 1);
      x.value = withTiming(0);
      y.value = withTiming(0);
      scheduleOnRN(report, zoomIn);
    },
  });

  const gesture = useSimultaneousGestures(pinch, pan, doubleTap);

  // Animated styles are the one place a style object is unavoidable: the values live on the UI thread.
  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ width, height }, animated]}>
        <Image source={{ uri }} className="h-full w-full" contentFit="contain" />
      </Animated.View>
    </GestureDetector>
  );
}
