import { Tabs, useRouter } from "expo-router";
import { Bell, Compass, FolderTree, Inbox, LayoutGrid, Plus, Settings } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { AccountTitle } from "@/components/account-chrome";
import { Text } from "@/components/ui/text";
import { useColors } from "@/lib/theme";
import { useStats } from "@/lib/queries";
import { useNotifications } from "@/lib/social-queries";

/** Notifications and "add a link", in the header of every tab. */
function HeaderActions() {
  const router = useRouter();
  const colors = useColors();
  const unread = useNotifications().data?.unreadCount ?? 0;
  return (
    <View className="mr-3 flex-row items-center gap-3">
      <Pressable
        accessibilityLabel={unread > 0 ? `${String(unread)} new notifications` : "Notifications"}
        hitSlop={8}
        onPress={() => {
          router.push("/notifications");
        }}
        className="h-9 w-9 items-center justify-center"
      >
        <Bell color={colors.foreground} size={22} />
        {unread > 0 ? (
          <View className="absolute right-0 top-0 min-w-4 items-center rounded-full bg-primary px-1">
            <Text className="text-[10px] font-semibold text-primary-foreground">{unread > 99 ? "99+" : unread}</Text>
          </View>
        ) : null}
      </Pressable>
      <Pressable
        accessibilityLabel="Add link"
        hitSlop={8}
        onPress={() => {
          router.push("/add-link");
        }}
        className="h-9 w-9 items-center justify-center rounded-full bg-primary"
      >
        <Plus color="#ffffff" size={20} />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const colors = useColors();
  const stats = useStats();
  const inbox = stats.data?.byWorkflow.inbox ?? 0;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        headerShadowVisible: false,
        headerRight: () => <HeaderActions />,
      }}
    >
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Sort",
          tabBarIcon: ({ color, size }) => <Inbox color={color} size={size} />,
          ...(inbox > 0 ? { tabBarBadge: inbox > 99 ? "99+" : inbox } : {}),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{ title: "Explore", tabBarIcon: ({ color, size }) => <Compass color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="index"
        options={{ title: "Library", headerTitle: () => <AccountTitle fallback="Library" />, tabBarIcon: ({ color, size }) => <LayoutGrid color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="folders"
        options={{ title: "Folders", tabBarIcon: ({ color, size }) => <FolderTree color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Settings", tabBarIcon: ({ color, size }) => <Settings color={color} size={size} /> }}
      />
    </Tabs>
  );
}
