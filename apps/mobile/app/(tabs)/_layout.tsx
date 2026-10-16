import { Tabs } from "expo-router";
import { FolderTree, Inbox, LayoutGrid, Settings } from "lucide-react-native";
import { useColors } from "@/lib/theme";
import { useStats } from "@/lib/queries";

export default function TabsLayout() {
  const colors = useColors();
  const stats = useStats();
  const inbox = (stats.data?.byWorkflow.inbox ?? 0) + (stats.data?.withSuggestions ?? 0);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Library", tabBarIcon: ({ color, size }) => <LayoutGrid color={color} size={size} /> }}
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
