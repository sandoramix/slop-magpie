import type { Profile } from "@magpie/shared/api";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Flag, UserCheck, UserPlus, UserX } from "lucide-react-native";
import { ActivityIndicator, View } from "react-native";
import { PostGrid } from "@/components/post-grid";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { alert } from "@/lib/alert";
import { useBlock, useFollow, useProfile, useProfilePosts, useReport } from "@/lib/social-queries";

function Header({ profile }: { profile: Profile }) {
  const router = useRouter();
  const follow = useFollow(profile.name);
  const block = useBlock(profile.name);
  const report = useReport();
  const fail = (e: Error) => {
    alert("Failed", e.message);
  };

  return (
    <View className="gap-3 p-4">
      <View className="gap-1">
        <Text className="text-xl font-bold">{profile.displayName ?? profile.name}</Text>
        <Text className="text-sm text-muted-foreground">@{profile.name}</Text>
        {profile.bio ? <Text className="mt-1 text-sm">{profile.bio}</Text> : null}
      </View>
      <View className="flex-row gap-6">
        <Text className="text-sm">
          <Text className="font-bold">{profile.postCount}</Text> posts
        </Text>
        <Text className="text-sm">
          <Text className="font-bold">{profile.followerCount}</Text> followers
        </Text>
        <Text className="text-sm">
          <Text className="font-bold">{profile.followingCount}</Text> following
        </Text>
      </View>

      {profile.isMe ? (
        <Button
          variant="outline"
          onPress={() => {
            router.push("/(tabs)/me");
          }}
        >
          <Text>Go to your dashboard</Text>
        </Button>
      ) : profile.blockedByMe ? (
        <Button
          variant="outline"
          disabled={block.isPending}
          onPress={() => {
            block.mutate(false, { onError: fail });
          }}
        >
          <Text>Unblock</Text>
        </Button>
      ) : (
        <View className="flex-row gap-2">
          <Button
            className="flex-1"
            variant={profile.followedByMe ? "outline" : "default"}
            disabled={follow.isPending}
            onPress={() => {
              follow.mutate(!profile.followedByMe, { onError: fail });
            }}
          >
            <Icon as={profile.followedByMe ? UserCheck : UserPlus} size={16} className={profile.followedByMe ? "text-foreground" : "text-primary-foreground"} />
            <Text>{profile.followedByMe ? "Following" : "Follow"}</Text>
          </Button>
          <Button
            variant="outline"
            size="icon"
            accessibilityLabel="Report"
            onPress={() => {
              alert(`Report @${profile.name}?`, "A moderator will look at it.", [
                { text: "Cancel", style: "cancel" },
                { text: "Report", onPress: () => { report.mutate({ target: "user", targetId: profile.name, reason: "reported from profile" }, { onSuccess: () => { alert("Reported", "Thank you."); }, onError: fail }); } },
              ]);
            }}
          >
            <Icon as={Flag} size={16} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            accessibilityLabel="Block"
            onPress={() => {
              alert(`Block @${profile.name}?`, "You will no longer see each other's posts, and any follows end.", [
                { text: "Cancel", style: "cancel" },
                { text: "Block", style: "destructive", onPress: () => { block.mutate(true, { onError: fail }); } },
              ]);
            }}
          >
            <Icon as={UserX} size={16} />
          </Button>
        </View>
      )}
    </View>
  );
}

export default function ProfileScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const profile = useProfile(name);
  const posts = useProfilePosts(name);

  if (!profile.data) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-8">
        {profile.isError ? <Text className="text-center text-muted-foreground">{profile.error.message}</Text> : <ActivityIndicator />}
      </View>
    );
  }
  const list = posts.data?.pages.flatMap((p) => p.posts) ?? [];
  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: `@${profile.data.name}` }} />
      <PostGrid
        posts={profile.data.blockedByMe ? [] : list}
        header={<Header profile={profile.data} />}
        empty={profile.data.blockedByMe ? "You blocked this person." : "No public posts yet."}
        refreshing={posts.isRefetching}
        onRefresh={() => {
          void profile.refetch();
          void posts.refetch();
        }}
        onEndReached={() => {
          if (posts.hasNextPage && !posts.isFetchingNextPage) void posts.fetchNextPage();
        }}
        loadingMore={posts.isFetchingNextPage}
      />
    </View>
  );
}
