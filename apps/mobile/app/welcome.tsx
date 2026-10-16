import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { AccountForm } from "@/components/account-form";
import { SafeAreaView } from "@/components/styled";
import { Text } from "@/components/ui/text";

/** First screen: nothing works until a server and token are set. Leaving happens by the route guard once an account exists. */
export default function Welcome() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerClassName="grow justify-center gap-6 p-6" keyboardShouldPersistTaps="handled">
          <View className="gap-2">
            <Text variant="h3">Welcome to Magpie</Text>
            <Text className="text-muted-foreground">
              Connect to your Magpie server. Use the access token you were given, or the admin token to manage accounts.
            </Text>
          </View>
          <AccountForm onDone={() => undefined} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
