import { useRouter } from "expo-router";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

export function SetupNotice() {
  const router = useRouter();
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background p-8">
      <Text variant="h4">Connect to your server</Text>
      <Text className="text-center text-muted-foreground">
        Enter the URL of your Magpie API and your access token to start saving links.
      </Text>
      <Button
        onPress={() => {
          router.navigate("/settings");
        }}
      >
        <Text>Open settings</Text>
      </Button>
    </View>
  );
}
