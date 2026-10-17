import { accountLabel, type Role, type User } from "@magpie/shared/api";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { Plus, Send, Shield } from "lucide-react-native";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Share, View } from "react-native";
import { Chip } from "@/components/chip";
import { StorageMeter } from "@/components/storage-meter";
import { SafeAreaView } from "@/components/styled";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { alert } from "@/lib/alert";
import { inviteMessage } from "@/lib/invite";
import { useCreateUser, useDeleteUser, useMe, useRotateUserToken, useSetUserRole, useSetUserStorageLimit, useUsers } from "@/lib/queries";
import { useAccounts, useActiveAccount } from "@/stores/accounts";

/** Shown once after creating an account or rotating its token. */
type Issued = { name: string; username: string; token: string };

/** The last step of deleting an account: the admin has to type its username. */
type PendingDelete = { id: string; name: string; username: string; items: number };

/** The inline editor for one account's storage limit (whole or decimal GB; empty means no limit). */
type LimitEdit = { id: string; name: string; text: string };

const GB = 1024 ** 3;

/** Accounts on the server. Admin token only; the server enforces it. */
export default function AdminScreen() {
  const router = useRouter();
  const users = useUsers(true);
  const create = useCreateUser();
  const rotate = useRotateUserToken();
  const remove = useDeleteUser();
  const setRole = useSetUserRole();
  const setLimit = useSetUserStorageLimit();
  const [limitEdit, setLimitEdit] = useState<LimitEdit | null>(null);
  const me = useMe();
  const [role, setNewRole] = useState<Role>("user");
  const setActAs = useAccounts((s) => s.setActAs);
  const [name, setName] = useState("");
  const [issued, setIssued] = useState<Issued | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [typed, setTyped] = useState("");
  const account = useActiveAccount();
  // where the new account should connect; defaults to the server this admin is using, editable for other addresses
  const [serverUrl, setServerUrl] = useState(account?.url ?? "");

  const fail = (e: Error) => {
    alert("Failed", e.message);
  };

  const add = () => {
    const n = name.trim();
    if (!n) return;
    create.mutate({ name: n, role }, {
      onSuccess: ({ user, token }) => {
        setName("");
        setIssued({ name: accountLabel(user), username: user.name, token });
      },
      onError: fail,
    });
  };

  /** Tokens are only stored as hashes, so "share again" issues a fresh one; that is harmless until the person has signed in. */
  const reinvite = (u: User) => {
    alert("Share the invite again?", `${accountLabel(u)} has not signed in yet. A new token replaces the old one, so an invite you already sent stops working.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "New invite",
        onPress: () => {
          rotate.mutate(u.id, { onSuccess: ({ token }) => { setIssued({ name: accountLabel(u), username: u.name, token }); }, onError: fail });
        },
      },
    ]);
  };

  /** Two confirmations: a warning, then typing the username. */
  const startDelete = (u: User) => {
    const label = accountLabel(u);
    const target: PendingDelete = { id: u.id, name: label, username: u.name, items: u.itemCount };
    alert(
      `Delete ${label}?`,
      `This permanently deletes @${u.name} and everything in the account: ${String(u.itemCount)} item(s) with their downloaded files, folders, tags, fields and smart folders. There is no trash and no backup. Their devices are signed out and told the account was deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => {
            setTyped("");
            setPendingDelete(target);
          },
        },
      ],
    );
  };

  const startLimitEdit = (u: User) => {
    const limit = u.storage?.limitBytes ?? null;
    setLimitEdit({ id: u.id, name: accountLabel(u), text: limit === null ? "" : String(Math.round((limit / GB) * 100) / 100) });
  };

  const saveLimit = () => {
    if (!limitEdit) return;
    const raw = limitEdit.text.trim().replace(",", ".");
    const gb = raw === "" ? null : Number(raw);
    if (gb !== null && (!Number.isFinite(gb) || gb <= 0)) {
      alert("Invalid limit", "Enter a number of GB greater than 0, or leave it empty for no limit.");
      return;
    }
    setLimit.mutate(
      { id: limitEdit.id, limitBytes: gb === null ? null : Math.round(gb * GB) },
      { onSuccess: () => { setLimitEdit(null); }, onError: fail },
    );
  };

  const options = (u: User) => {
    const userName = accountLabel(u);
    // the root admin (API_TOKEN) and your own account keep their role and cannot be removed here
    const self = u.id === me.data?.id;
    const buttons = [
      {
        text: "View library",
        onPress: () => {
          setActAs({ id: u.id, name: userName });
          router.dismissTo("/");
        },
      },
      { text: "Storage limit…", onPress: () => { startLimitEdit(u); } },
      ...(u.isRoot || self
        ? []
        : [
            ...(u.hasPassword === false ? [{ text: "Share invite again", onPress: () => { reinvite(u); } }] : []),
            {
              text: u.isAdmin ? "Make regular user" : "Make admin",
              onPress: () => {
                setRole.mutate({ id: u.id, role: u.isAdmin ? "user" : "admin" }, { onError: fail });
              },
            },
            {
              text: "Reset password / new token",
              onPress: () => {
                alert("Reset this account?", `${userName}'s password is removed and every device is signed out. They sign in with the new token and choose a new password.`, [
                  { text: "Cancel", style: "cancel" as const },
                  {
                    text: "Reset",
                    style: "destructive" as const,
                    onPress: () => {
                      rotate.mutate(u.id, { onSuccess: ({ token }) => { setIssued({ name: userName, username: u.name, token }); }, onError: fail });
                    },
                  },
                ]);
              },
            },
            {
              text: "Delete account…",
              style: "destructive" as const,
              onPress: () => {
                startDelete(u);
              },
            },
          ]),
      { text: "Cancel", style: "cancel" as const },
    ];
    alert(userName, `@${u.name}`, buttons);
  };

  const invite = (token: string, username: string) => inviteMessage({ url: serverUrl.trim().replace(/\/+$/, ""), username, token });
  const serverOk = /^https?:\/\//i.test(serverUrl.trim());

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
        {limitEdit ? (
          <View className="gap-2 rounded-lg border border-primary p-3">
            <Text className="font-medium">Storage limit for {limitEdit.name}</Text>
            <Text className="text-xs text-muted-foreground">
              Maximum size of the downloaded media this account may keep, in GB. Empty means no limit. Saving is refused and downloads fail once it is full; nothing is deleted if you lower it below the current use.
            </Text>
            <Input value={limitEdit.text} onChangeText={(text) => { setLimitEdit({ ...limitEdit, text }); }} placeholder="No limit" keyboardType="decimal-pad" />
            <View className="flex-row gap-2">
              <Button size="sm" disabled={setLimit.isPending} onPress={saveLimit}>
                <Text>{setLimit.isPending ? "Saving…" : "Save"}</Text>
              </Button>
              <Button variant="ghost" size="sm" onPress={() => { setLimitEdit(null); }}>
                <Text>Cancel</Text>
              </Button>
            </View>
          </View>
        ) : null}

        {pendingDelete ? (
          <View className="gap-2 rounded-lg border border-destructive p-3">
            <Text className="font-medium text-destructive">Last step: delete {pendingDelete.name}</Text>
            <Text className="text-xs text-muted-foreground">
              {String(pendingDelete.items)} item(s) and all downloaded files will be removed for good. Type the username{" "}
              <Text className="text-xs font-semibold">{pendingDelete.username}</Text> to confirm.
            </Text>
            <Input value={typed} onChangeText={setTyped} placeholder={pendingDelete.username} autoCapitalize="none" autoCorrect={false} />
            <View className="flex-row gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={remove.isPending || typed.trim() !== pendingDelete.username}
                onPress={() => {
                  remove.mutate(pendingDelete.id, {
                    onSuccess: () => {
                      setPendingDelete(null);
                      setTyped("");
                    },
                    onError: fail,
                  });
                }}
              >
                <Text>{remove.isPending ? "Deleting…" : "Delete forever"}</Text>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onPress={() => {
                  setPendingDelete(null);
                  setTyped("");
                }}
              >
                <Text>Cancel</Text>
              </Button>
            </View>
          </View>
        ) : null}

        {issued ? (
          <View className="gap-2 rounded-lg border border-primary p-3">
            <Text className="font-medium">Token for {issued.name}</Text>
            <Text className="text-xs text-muted-foreground">
              It is shown only now. The invite has a link that opens the app, plus the server address, their username and the token; they can also type the details in. They can change how their name is shown, but not the username.
            </Text>
            <Text selectable className="font-mono text-xs">
              {issued.token}
            </Text>
            <Text className="text-xs text-muted-foreground">Server address in the invite</Text>
            <Input value={serverUrl} onChangeText={setServerUrl} placeholder="https://magpie.example.com" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
            <View className="flex-row flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!serverOk}
                onPress={() => {
                  void Share.share({ message: invite(issued.token, issued.username) });
                }}
              >
                <Text>Share invite</Text>
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!serverOk}
                onPress={() => {
                  void Clipboard.setStringAsync(invite(issued.token, issued.username));
                }}
              >
                <Text>Copy invite</Text>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onPress={() => {
                  void Clipboard.setStringAsync(issued.token);
                }}
              >
                <Text>Copy token</Text>
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
        {users.data?.map((u) => {
          const pending = u.hasPassword === false && !u.isRoot && u.id !== me.data?.id;
          return (
            <Pressable
              key={u.id}
              onPress={() => {
                options(u);
              }}
              className="flex-row items-center gap-3 rounded-lg border border-border p-3 active:bg-accent"
            >
              <View className="flex-1">
                <View className="flex-row items-center gap-1.5">
                  <Text className="font-medium">{accountLabel(u)}</Text>
                  {u.isAdmin ? <Icon as={Shield} size={14} className="text-muted-foreground" /> : null}
                </View>
                <Text className="text-xs text-muted-foreground">
                  @{u.name} · {u.isAdmin ? "admin" : "user"} · {u.itemCount} items{pending ? " · invite pending" : ""}
                </Text>
                {u.storage ? <StorageMeter storage={u.storage} compact /> : null}
              </View>
              {pending ? (
                <Button
                  size="sm"
                  variant="outline"
                  onPress={() => {
                    reinvite(u);
                  }}
                >
                  <Icon as={Send} size={14} />
                  <Text>Invite</Text>
                </Button>
              ) : null}
            </Pressable>
          );
        })}
        <Text className="text-center text-xs text-muted-foreground">Tap an account to view its library, change its storage limit, share its invite again, replace its token or delete it.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
