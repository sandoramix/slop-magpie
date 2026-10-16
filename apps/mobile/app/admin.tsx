import { accountLabel, type Role } from "@magpie/shared/api";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { Plus, Shield } from "lucide-react-native";
import { useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Chip } from "@/components/chip";
import { SafeAreaView } from "@/components/styled";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useCreateUser, useDeleteUser, useMe, useRotateUserToken, useSetUserRole, useUsers } from "@/lib/queries";
import { useAccounts } from "@/stores/accounts";

/** Shown once after creating an account or rotating its token. */
type Issued = { name: string; token: string };

/** Accounts on the server. Admin token only; the server enforces it. */
export default function AdminScreen() {
  const router = useRouter();
  const users = useUsers(true);
  const create = useCreateUser();
  const rotate = useRotateUserToken();
  const remove = useDeleteUser();
  const setRole = useSetUserRole();
  const me = useMe();
  const [role, setNewRole] = useState<Role>("user");
  const setActAs = useAccounts((s) => s.setActAs);
  const [name, setName] = useState("");
  const [issued, setIssued] = useState<Issued | null>(null);

  const fail = (e: Error) => {
    Alert.alert("Failed", e.message);
  };

  const add = () => {
    const n = name.trim();
    if (!n) return;
    create.mutate({ name: n, role }, {
      onSuccess: ({ user, token }) => {
        setName("");
        setIssued({ name: user.name, token });
      },
      onError: fail,
    });
  };

  const options = (id: string, userName: string, isAdmin: boolean, isRoot: boolean) => {
    // the root admin (API_TOKEN) and your own account keep their role and cannot be removed here
    const self = id === me.data?.id;
    const buttons = [
      {
        text: "View library",
        onPress: () => {
          setActAs({ id, name: userName });
          router.dismissTo("/");
        },
      },
      ...(isRoot || self
        ? []
        : [
            {
              text: isAdmin ? "Make regular user" : "Make admin",
              onPress: () => {
                setRole.mutate({ id, role: isAdmin ? "user" : "admin" }, { onError: fail });
              },
            },
            {
              text: "Reset password / new token",
              onPress: () => {
                Alert.alert("Reset this account?", `${userName}'s password is removed and every device is signed out. They sign in with the new token and choose a new password.`, [
                  { text: "Cancel", style: "cancel" as const },
                  {
                    text: "Reset",
                    style: "destructive" as const,
                    onPress: () => {
                      rotate.mutate(id, { onSuccess: ({ token }) => { setIssued({ name: userName, token }); }, onError: fail });
                    },
                  },
                ]);
              },
            },
            {
              text: "Delete account",
              style: "destructive" as const,
              onPress: () => {
                Alert.alert("Delete account?", `${userName}'s library and downloaded files are removed for good.`, [
                  { text: "Cancel", style: "cancel" as const },
                  {
                    text: "Delete",
                    style: "destructive" as const,
                    onPress: () => {
                      remove.mutate(id, { onError: fail });
                    },
                  },
                ]);
              },
            },
          ]),
      { text: "Cancel", style: "cancel" as const },
    ];
    Alert.alert(userName, undefined, buttons);
  };

  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="gap-3 p-4"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={users.isRefetching}
            onRefresh={() => {
              void users.refetch();
            }}
          />
        }
      >
        {issued ? (
          <View className="gap-2 rounded-lg border border-primary p-3">
            <Text className="font-medium">Token for {issued.name}</Text>
            <Text className="text-xs text-muted-foreground">
              It is shown only now. Send it to them; they enter it with the server URL. They can change how their name is shown, but not the username.
            </Text>
            <Text selectable className="font-mono text-xs">
              {issued.token}
            </Text>
            <View className="flex-row gap-2">
              <Button
                size="sm"
                onPress={() => {
                  void Clipboard.setStringAsync(issued.token);
                }}
              >
                <Text>Copy</Text>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onPress={() => {
                  setIssued(null);
                }}
              >
                <Text>Done</Text>
              </Button>
            </View>
          </View>
        ) : null}

        <View className="flex-row gap-2">
          <Chip
            label="User"
            active={role === "user"}
            onPress={() => {
              setNewRole("user");
            }}
          />
          <Chip
            label="Admin"
            active={role === "admin"}
            onPress={() => {
              setNewRole("admin");
            }}
          />
        </View>
        <View className="flex-row gap-2">
          <Input className="flex-1" value={name} onChangeText={setName} placeholder="Username (fixed once created)" autoCapitalize="words" />
          <Button disabled={create.isPending || !name.trim()} onPress={add}>
            <Icon as={Plus} className="text-primary-foreground" />
            <Text>Add</Text>
          </Button>
        </View>

        {users.isError ? <Text className="text-destructive">{users.error.message}</Text> : null}
        {users.data?.map((u) => (
          <Pressable
            key={u.id}
            onPress={() => {
              options(u.id, accountLabel(u), u.isAdmin, u.isRoot);
            }}
            className="flex-row items-center gap-3 rounded-lg border border-border p-3 active:bg-accent"
          >
            <View className="flex-1">
              <View className="flex-row items-center gap-1.5">
                <Text className="font-medium">{accountLabel(u)}</Text>
                {u.isAdmin ? <Icon as={Shield} size={14} className="text-muted-foreground" /> : null}
              </View>
              <Text className="text-xs text-muted-foreground">
                @{u.name} · {u.isAdmin ? "admin" : "user"} · {u.itemCount} items
              </Text>
            </View>
          </Pressable>
        ))}
        <Text className="text-center text-xs text-muted-foreground">Tap an account to view its library, replace its token or delete it.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
