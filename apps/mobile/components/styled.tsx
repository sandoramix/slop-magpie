import { Image } from "expo-image";
import { VideoView } from "expo-video";
import { cssInterop } from "nativewind";

// Third-party views that don't read `className` on their own.
cssInterop(Image, { className: "style" });
cssInterop(VideoView, { className: "style" });

export { Image, VideoView };
