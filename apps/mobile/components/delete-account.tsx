import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { alert } from "@/lib/alert";
import { useDeleteMyAccount } from "@/lib/social-queries";
import { useAccounts, useActiveAccount } from "@/stores/accounts";

/** Settings: leave Magpie. Everything in the account goes, including posts other people saved. */
export function DeleteAccountSection({ username, isRoot }: { username: string; isRoot: boolean }) {
  const router = useRouter();
  const account = useActiveAccount();
  const remove = useAccounts((s) => s.remove);
  const del = useDeleteMyAccount();
  const [typed, setTyped] = useState("");
  const [open, setOpen] = useState(false);

  // the root admin account is the deployment itself and cannot be deleted
  if (isRoot) return null;

  const confirm = () => {
    del.mutate(typed.trim(), {
      onSuccess: () => {
        void (async () => {
          if (account) await remove(account.id);
          alert("Account deleted", "Your library and posts are gone from the server.");
          router.replace("/");
        })();
      },
      onError: (e) => {
        alert("Failed", e.message);
      },
    });
  };

  return (
    <View className="gap-2 rounded-xl border border-destructive p-4">
      <Text className="font-medium text-destructive">Delete account</Text>
      <Text className="text-sm text-muted-foreground">
        Removes your library, files, likes and feedback. Posts you shared disappear for everyone who saved them, and they are told. This cannot be undone.
      </Text>
      {open ? (
        <>
          <Input value={typed} onChangeText={setTyped} placeholder={`Type ${username} to confirm`} autoCapitalize="none" autoCorrect={false} />
          <Button variant="destructive" disabled={del.isPending || typed.trim().toLowerCase() !== username.toLowerCase()} onPress={confirm}>
            <Text>{del.isPending ? "Deleting…" : "Delete my account"}</Text>
          </Button>
        </>
      ) : (
        <Button
          variant="outline"
          onPress={() => {
            setOpen(true);
          }}
        >
          <Text>Delete account…</Text>
        </Button>
      )}
    </View>
  );
}
