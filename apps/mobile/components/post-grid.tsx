import type { PostSummary } from "@magpie/shared/api";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { Bookmark, Heart, Images, Link2, Play } from "lucide-react-native";
import { ActivityIndicator, Pressable, RefreshControl, View } from "react-native";
import { Image } from "@/components/styled";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { aspectClass } from "@/lib/media";
import { feedbackLine } from "@/lib/social";
import { cn } from "@/lib/utils";

function PostCard({ post }: { post: PostSummary }) {
  const router = useRouter();
  const line = feedbackLine(post.feedback);
  return (
    <Pressable
      onPress={() => {
        // your own posts open in the library view, where they can be edited
        if (post.mine) router.push({ pathname: "/item/[id]", params: { id: post.id } });
        else router.push({ pathname: "/post/[id]", params: { id: post.id } });
      }}
      className="p-1"
    >
      <View className="overflow-hidden rounded-lg bg-muted">
        {post.thumbUrl ? (
          <Image source={{ uri: post.thumbUrl }} className={cn("w-full", aspectClass(post.aspectRatio))} contentFit="cover" />
        ) : (
          <View className={cn("w-full items-center justify-center p-3", aspectClass(post.aspectRatio ?? 1))}>
            <Icon as={Link2} className="text-muted-foreground" size={24} />
            <Text className="mt-2 text-center text-xs text-muted-foreground" numberOfLines={3}>
              {post.title ?? post.source}
            </Text>
          </View>
        )}
        <View className="absolute left-1.5 top-1.5 flex-row gap-1">
          {post.kind === "video" && (
            <View className="rounded-full bg-black/60 p-1">
              <Icon as={Play} size={11} className="text-white" />
            </View>
          )}
          {post.kind === "gallery" && (
            <View className="flex-row items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5">
              <Icon as={Images} size={11} className="text-white" />
              <Text className="text-[10px] text-white">{post.mediaCount}</Text>
            </View>
          )}
        </View>
      </View>
      {post.title ? (
        <Text className="mt-1 px-0.5 text-xs font-medium" numberOfLines={2}>
          {post.title}
        </Text>
      ) : null}
      <View className="flex-row items-center gap-2 px-0.5">
        <Text className="flex-1 text-[11px] text-muted-foreground" numberOfLines={1}>
          @{post.owner.name}
        </Text>
        <View className="flex-row items-center gap-0.5">
          <Icon as={Heart} size={11} className={post.likedByMe ? "text-primary" : "text-muted-foreground"} />
          <Text className="text-[11px] text-muted-foreground">{post.likeCount}</Text>
        </View>
        <View className="flex-row items-center gap-0.5">
          <Icon as={Bookmark} size={11} className={post.savedByMe ? "text-primary" : "text-muted-foreground"} />
          <Text className="text-[11px] text-muted-foreground">{post.saveCount}</Text>
        </View>
      </View>
      {line ? <Text className="px-0.5 text-[11px] text-muted-foreground">{line}</Text> : null}
    </Pressable>
  );
}

type Props = {
  posts: PostSummary[];
  columns?: number;
  header?: React.ReactElement | null;
  empty: string;
  refreshing: boolean;
  onRefresh: () => void;
  onEndReached?: () => void;
  loadingMore?: boolean;
};

export function PostGrid({ posts, columns = 2, header, empty, refreshing, onRefresh, onEndReached, loadingMore }: Props) {
  return (
    <FlashList
      data={posts}
      masonry
      numColumns={columns}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={header ?? null}
      renderItem={({ item }) => <PostCard post={item} />}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.8}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerClassName="px-1.5 pb-24"
      ListEmptyComponent={
        <View className="items-center px-8 py-24">
          <Text className="text-center text-muted-foreground">{empty}</Text>
        </View>
      }
      ListFooterComponent={loadingMore ? <ActivityIndicator className="py-6" /> : null}
    />
  );
}
