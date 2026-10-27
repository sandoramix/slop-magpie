import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { notificationText } from "@/lib/social";
import { useMarkNotificationsRead, useNotifications } from "@/lib/social-queries";
import { cn } from "@/lib/utils";

export default function NotificationsScreen() {
  const router = useRouter();
  const query = useNotifications();
  const markRead = useMarkNotificationsRead();
  const list = query.data?.notifications ?? [];
  const unread = query.data?.unreadCount ?? 0;

  // seeing them is reading them; the highlight stays for this visit so new ones are easy to spot
  const leaving = useRef({ unread, mark: markRead.mutate });
  leaving.current = { unread, mark: markRead.mutate };
  useEffect(
    () => () => {
      if (leaving.current.unread > 0) leaving.current.mark(undefined);
    },
    [],
  );

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={list}
        keyExtractor={(n) => n.id}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => {
              void query.refetch();
            }}
          />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              if (item.type === "new_follower" && item.payload.person) router.push({ pathname: "/profile/[name]", params: { name: item.payload.person } });
              else if ((item.type === "post_saved" || item.type === "feedback_received") && item.payload.itemId) {
                router.push({ pathname: "/item/[id]", params: { id: item.payload.itemId } });
              }
            }}
            className={cn("flex-row gap-3 border-b border-border px-4 py-3", !item.read && "bg-accent")}
          >
            <View className="flex-1 gap-1">
              <Text className="text-sm">{notificationText(item)}</Text>
              <Text className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          query.isPending ? (
            <ActivityIndicator className="py-12" />
          ) : (
            <View className="items-center px-8 py-24">
              <Text className="text-center text-muted-foreground">Nothing yet. You will hear here when someone follows you, saves a post of yours, or a post you saved is removed.</Text>
            </View>
          )
        }
        ListFooterComponent={
          <View className="p-4">
            {unread > 0 ? (
              <Button
                variant="outline"
                onPress={() => {
                  markRead.mutate(undefined);
                }}
              >
                <Text>Mark all as read</Text>
              </Button>
            ) : null}
          </View>
        }
      />
    </View>
  );
}
