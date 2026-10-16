import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView } from "react-native";
import { AccountForm } from "@/components/account-form";
import { SafeAreaView } from "@/components/styled";
import { useAccounts } from "@/stores/accounts";

/** Add an account, or edit one with `?id=`. */
export default function AccountFormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const account = useAccounts((s) => s.accounts.find((a) => a.id === id));

  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-background">
      <ScrollView contentContainerClassName="p-4" keyboardShouldPersistTaps="handled">
        <AccountForm
          {...(account ? { account } : {})}
          onDone={() => {
            router.dismissTo("/");
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
