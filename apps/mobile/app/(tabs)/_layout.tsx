import { Tabs, useRouter } from "expo-router";
import { FolderTree, Inbox, LayoutGrid, Plus, Settings } from "lucide-react-native";
import { Pressable } from "react-native";
import { AccountTitle } from "@/components/account-chrome";
import { useColors } from "@/lib/theme";
import { useStats } from "@/lib/queries";

export default function TabsLayout() {
  const colors = useColors();
  const router = useRouter();
  const stats = useStats();
  const inbox = (stats.data?.byWorkflow.inbox ?? 0) + (stats.data?.withSuggestions ?? 0);

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
        name="index"
        options={{ title: "Library", headerTitle: () => <AccountTitle fallback="Library" />, tabBarIcon: ({ color, size }) => <LayoutGrid color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Inbox",
          tabBarIcon: ({ color, size }) => <Inbox color={color} size={size} />,
          ...(inbox > 0 ? { tabBarBadge: inbox > 99 ? "99+" : inbox } : {}),
        }}
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
