import { Image } from "expo-image";
import { VideoView } from "expo-video";
import { cssInterop } from "nativewind";
import { SafeAreaView } from "react-native-safe-area-context";

// Third-party views that don't read `className` on their own.
cssInterop(Image, { className: "style" });
cssInterop(VideoView, { className: "style" });
cssInterop(SafeAreaView, { className: "style" });

export { Image, SafeAreaView, VideoView };
