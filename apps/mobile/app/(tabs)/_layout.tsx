import { Tabs, useRouter } from "expo-router";
import { Compass, FolderTree, Inbox, LayoutGrid, Plus, UserRound } from "lucide-react-native";
import { Pressable } from "react-native";
import { AccountTitle } from "@/components/account-chrome";
import { useColors } from "@/lib/theme";
import { useStats } from "@/lib/queries";
import { useNotifications } from "@/lib/social-queries";

export default function TabsLayout() {
  const colors = useColors();
  const router = useRouter();
  const stats = useStats();
  const inbox = stats.data?.byWorkflow.inbox ?? 0;
  const unread = useNotifications().data?.unreadCount ?? 0;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        headerShadowVisible: false,
        // saving a link by hand is always one tap away
        headerRight: () => (
          <Pressable
            accessibilityLabel="Add link"
            hitSlop={8}
            onPress={() => {
              router.push("/add-link");
            }}
            className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-primary"
          >
            <Plus color="#ffffff" size={20} />
          </Pressable>
        ),
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
        name="index"
        options={{ title: "Library", headerTitle: () => <AccountTitle fallback="Library" />, tabBarIcon: ({ color, size }) => <LayoutGrid color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="folders"
        options={{ title: "Folders", tabBarIcon: ({ color, size }) => <FolderTree color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="explore"
        options={{ title: "Explore", tabBarIcon: ({ color, size }) => <Compass color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: "Me",
          tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} />,
          ...(unread > 0 ? { tabBarBadge: unread > 99 ? "99+" : unread } : {}),
        }}
      />
      {/* reached from Me; kept as a tab route so it keeps the tab bar */}
      <Tabs.Screen name="settings" options={{ title: "Settings", href: null }} />
    </Tabs>
  );
}
