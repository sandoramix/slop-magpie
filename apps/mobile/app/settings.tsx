import { useRouter } from "expo-router";
import { Shield } from "lucide-react-native";
import { accountLabel, ROOT_ADMIN_ID } from "@magpie/shared/api";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { alert } from "@/lib/alert";
import { Chip } from "@/components/chip";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { DeleteAccountSection } from "@/components/delete-account";
import { IdentitiesSection } from "@/components/identities-section";
import { StorageMeter } from "@/components/storage-meter";
import { UpdateCard } from "@/components/update-card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { appVersion } from "@/lib/changelog";
import { useMe, useSetPassword, useUpdateDisplayName } from "@/lib/queries";
import { useUpdateCheck } from "@/lib/updates";
import { useAccounts, useActiveAccount } from "@/stores/accounts";
import { useSettings, type ShareMode, type ThemePreference } from "@/stores/settings";

const THEMES: ThemePreference[] = ["system", "light", "dark"];
const COLUMNS = [1, 2, 3] as const;
const SHARE_MODES: { mode: ShareMode; label: string }[] = [
  { mode: "ask", label: "Ask each time" },
  { mode: "organize", label: "Organize now" },
  { mode: "later", label: "Save for later" },
];

export default function SettingsScreen() {
  const router = useRouter();
  const settings = useSettings();
  const account = useActiveAccount();
  const setRole = useAccounts((s) => s.setRole);
  const me = useMe();
  const update = useUpdateCheck();
  const updateName = useUpdateDisplayName();
  const setPasswordMutation = useSetPassword();
  const qc = useQueryClient();
  const saveAccount = useAccounts((s) => s.save);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [displayName, setDisplayName] = useState("");
  const available = update.data;

  // the server is the source of truth for the role (it may have changed since the account was added)
  const role = me.data?.isAdmin;
  useEffect(() => {
    if (account && role !== undefined) setRole(account.id, role);
  }, [account, role, setRole]);

  // fill the field once the server has answered
  const serverName = me.data?.displayName ?? "";
  useEffect(() => {
    setDisplayName(serverName);
  }, [serverName]);

  const saveName = () => {
    const next = displayName.trim();
    if (next === serverName) return;
    updateName.mutate({ displayName: next === "" ? null : next }, { onError: (e) => { alert("Failed", e.message); } });
  };

  const changePassword = () => {
    if (!account) return;
    if (password !== confirm) {
      alert("Passwords differ", "Type the same password twice.");
      return;
    }
    setPasswordMutation.mutate(password, {
      onSuccess: (login) => {
        void (async () => {
          // the temporary token no longer works: from now on this device uses its session token.
          // The root admin gets none (token is null): its API_TOKEN stays valid and in use.
          if (login.token) {
            await saveAccount({ id: account.id, name: account.name, url: account.url, isAdmin: login.me.isAdmin }, login.token);
          }
          setPassword("");
          setConfirm("");
          await qc.invalidateQueries({ queryKey: ["me"] });
          alert("Password set", "Use your username and password to sign in on other devices.");
        })();
      },
      onError: (e) => {
        alert("Failed", e.message);
      },
    });
  };

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-3 p-4" keyboardShouldPersistTaps="handled">
      <Text variant="large">Account</Text>
      <View className="gap-1 rounded-lg border border-border p-3">
        <View className="flex-row items-center gap-1.5">
          <Text className="font-medium">{account?.name ?? "—"}</Text>
          {account?.isAdmin ? <Icon as={Shield} size={14} className="text-muted-foreground" /> : null}
        </View>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {account?.url}
        </Text>
        {me.data ? (
          <Text className="text-xs text-muted-foreground">
            Signed in as {accountLabel(me.data)} · username {me.data.name}
            {me.data.isAdmin ? " (admin)" : ""}
          </Text>
        ) : null}
        {me.data?.storage ? <StorageMeter storage={me.data.storage} /> : null}
      </View>
      {me.data ? (
        <View className="gap-1">
          <Text className="text-sm text-muted-foreground">Display name</Text>
          <Input value={displayName} onChangeText={setDisplayName} onBlur={saveName} placeholder={me.data.name} autoCapitalize="words" />
          <Text className="text-xs text-muted-foreground">Shown instead of your username. Leave empty to use the username.</Text>
        </View>
      ) : null}
      <Button
        variant="outline"
        onPress={() => {
          router.push("/accounts");
        }}
      >
        <Text>Switch or add account</Text>
      </Button>
      {account?.isAdmin ? (
        <>
          <Button
            variant="outline"
            onPress={() => {
              router.push("/admin");
            }}
          >
            <Text>Manage users</Text>
          </Button>
          <Button
            variant="outline"
            onPress={() => {
              router.push("/credentials");
            }}
          >
            <Text>Instagram login</Text>
          </Button>
          <Button
            variant="outline"
            onPress={() => {
              router.push("/moderation");
            }}
          >
            <Text>Reports and invite codes</Text>
          </Button>
        </>
      ) : null}

      {me.data ? (
        <View className="gap-2 rounded-lg border border-border p-3">
          <Text className="font-medium">{me.data.hasPassword ? "Change password" : "Choose a password"}</Text>
          <Text className="text-xs text-muted-foreground">
            {me.data.hasPassword
              ? "Other devices are signed out when you change it."
              : me.data.isAdmin
                ? "Optional. You can sign in with the admin token, with a username and password, or both."
                : "Your access token is temporary. Once you choose a password it stops working and you sign in with your username and password."}
          </Text>
          <Input value={password} onChangeText={setPassword} placeholder="New password (10+ characters)" autoCapitalize="none" autoCorrect={false} secureTextEntry />
          <Input value={confirm} onChangeText={setConfirm} placeholder="Repeat password" autoCapitalize="none" autoCorrect={false} secureTextEntry />
          <Button disabled={setPasswordMutation.isPending || password.length < 10 || confirm === ""} onPress={changePassword}>
            <Text>{me.data.hasPassword ? "Change password" : "Set password"}</Text>
          </Button>
        </View>
      ) : null}

      <Button
        variant="outline"
        onPress={() => {
          router.push("/stop-terms");
        }}
      >
        <Text>Ignored keywords</Text>
      </Button>

      {me.data ? <IdentitiesSection /> : null}
      {me.data ? <DeleteAccountSection username={me.data.name} isRoot={me.data.id === ROOT_ADMIN_ID} /> : null}

      <Text variant="large" className="mt-4">
        Sharing
      </Text>
      <Text className="text-sm text-muted-foreground">
        Android's share sheet has two Magpie entries. "Magpie: save for later" always parks the link in your Inbox and takes you straight back; plain "Magpie" does what you pick here. Parked links wait in the Inbox until you sort them.
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {SHARE_MODES.map((m) => (
          <Chip
            key={m.mode}
            label={m.label}
            active={settings.shareMode === m.mode}
            onPress={() => {
              settings.setShareMode(m.mode);
            }}
          />
        ))}
      </View>

      <Text variant="large" className="mt-4">
        Appearance
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {THEMES.map((t) => (
          <Chip
            key={t}
            label={t.charAt(0).toUpperCase() + t.slice(1)}
            active={settings.theme === t}
            onPress={() => {
              settings.setTheme(t);
            }}
          />
        ))}
      </View>
      <Text className="text-sm text-muted-foreground">Grid columns</Text>
      <View className="flex-row gap-2">
        {COLUMNS.map((c) => (
          <Chip
            key={c}
            label={String(c)}
            active={settings.columns === c}
            onPress={() => {
              settings.setColumns(c);
            }}
          />
        ))}
      </View>

      <Text variant="large" className="mt-4">
        About
      </Text>
      <Text className="text-muted-foreground">Magpie {appVersion}</Text>
      <Text className="text-sm text-muted-foreground">
        {update.isFetching
          ? "Checking for updates…"
          : update.isError
            ? "Couldn't check for updates"
            : available
              ? `Version ${available.version} is available`
              : "You're up to date"}
      </Text>
      {available ? (
        <UpdateCard update={available} />
      ) : (
        <Button
          variant="outline"
          disabled={update.isFetching}
          onPress={() => {
            void update.refetch();
          }}
        >
          <Text>Check for updates</Text>
        </Button>
      )}
      <Button
        variant="outline"
        onPress={() => {
          router.push("/whats-new");
        }}
      >
        <Text>What's new</Text>
      </Button>
      {me.isError ? (
        <Button
          variant="ghost"
          onPress={() => {
            alert("Can't reach your account", me.error.message);
          }}
        >
          <Text className="text-destructive">Account problem: tap for details</Text>
        </Button>
      ) : null}
    </ScrollView>
  );
}
