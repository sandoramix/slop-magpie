import type { Profile } from "@magpie/shared/api";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from "react-native";
import { Chip } from "@/components/chip";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { alert } from "@/lib/alert";
import { useMe } from "@/lib/queries";
import { type FollowKind, useFollow, useFollows } from "@/lib/social-queries";

function PersonRow({ person, mine }: { person: Profile; mine: boolean }) {
  const router = useRouter();
  const follow = useFollow(person.name);
  const fail = (e: Error) => {
    alert("Failed", e.message);
  };
  const label = person.followedByMe ? "Unfollow" : mine ? "Follow back" : "Follow";

  return (
    <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
      <Pressable
        className="flex-1 flex-row items-center gap-3"
        onPress={() => {
          router.push({ pathname: "/profile/[name]", params: { name: person.name } });
        }}
      >
        <View className="h-11 w-11 items-center justify-center rounded-full bg-muted">
          <Text className="text-base font-semibold">{(person.displayName ?? person.name).charAt(0).toUpperCase()}</Text>
        </View>
        <View className="flex-1">
          <Text className="font-medium" numberOfLines={1}>
            {person.displayName ?? person.name}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            @{person.name} · {person.postCount} posts · {person.followerCount} followers
          </Text>
        </View>
      </Pressable>
      {person.isMe ? null : (
        <Button
          size="sm"
          variant={person.followedByMe ? "outline" : "default"}
          disabled={follow.isPending}
          onPress={() => {
            follow.mutate(!person.followedByMe, { onError: fail });
          }}
        >
          <Text>{label}</Text>
        </Button>
      )}
    </View>
  );
}

/** Followers and following of one person (default: you), with Follow / Unfollow on every row. */
export default function FollowsScreen() {
  const router = useRouter();
  const me = useMe();
  const params = useLocalSearchParams<{ name?: string; tab?: string }>();
  const name = params.name && params.name !== "" ? params.name : (me.data?.name ?? "");
  const kind: FollowKind = params.tab === "following" ? "following" : "followers";
  const list = useFollows(name, kind);
  const mine = name !== "" && name.toLowerCase() === me.data?.name.toLowerCase();

  const open = (tab: FollowKind) => {
    router.setParams({ name, tab });
  };

  const header = (
    <View className="gap-2 p-4">
      <Text className="text-sm text-muted-foreground">{mine ? "Your people" : `@${name}`}</Text>
      <View className="flex-row gap-2">
        <Chip
          label="Followers"
          active={kind === "followers"}
          onPress={() => {
            open("followers");
          }}
        />
        <Chip
          label="Following"
          active={kind === "following"}
          onPress={() => {
            open("following");
          }}
        />
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={list.data ?? []}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => <PersonRow person={item} mine={mine} />}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching}
            onRefresh={() => {
              void list.refetch();
            }}
          />
        }
        ListEmptyComponent={
          list.isPending ? (
            <ActivityIndicator className="py-12" />
          ) : list.isError ? (
            <Text className="px-8 py-12 text-center text-muted-foreground">{list.error.message}</Text>
          ) : (
            <Text className="px-8 py-12 text-center text-muted-foreground">
              {kind === "followers" ? (mine ? "Nobody follows you yet." : "No followers yet.") : mine ? "You are not following anyone. Find people in Explore." : "Not following anyone."}
            </Text>
          )
        }
      />
    </View>
  );
}
