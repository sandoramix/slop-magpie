import { accountLabel, ROOT_ADMIN_ID } from "@magpie/shared/api";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  Bell,
  Bookmark,
  Compass,
  EyeOff,
  Camera,
  MessageSquareHeart,
  ShieldAlert,
  Sparkles,
  UserCog,
  UserRound,
  UserX,
  Users,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { AppVersionCard } from "@/components/app-version-card";
import { Chip } from "@/components/chip";
import { DeleteAccountSection } from "@/components/delete-account";
import { IdentitiesSection } from "@/components/identities-section";
import { ProgressBar } from "@/components/progress-bar";
import { Panel, Row, Section } from "@/components/settings-ui";
import { StorageMeter } from "@/components/storage-meter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { alert } from "@/lib/alert";
import { useMe, useSetPassword, useUpdateDisplayName } from "@/lib/queries";
import { percent } from "@/lib/social";
import { useNotifications, useProfile, useProgress, useUpdateBio } from "@/lib/social-queries";
import { useAccounts, useActiveAccount } from "@/stores/accounts";
import { useSettings, type ShareMode, type ThemePreference, type ViewMode } from "@/stores/settings";

const THEMES: ThemePreference[] = ["system", "light", "dark"];
const COLUMNS = [1, 2, 3] as const;
const VIEWS: { mode: ViewMode; label: string }[] = [
  { mode: "grid", label: "Grid" },
  { mode: "list", label: "List" },
];
const SHARE_MODES: { mode: ShareMode; label: string }[] = [
  { mode: "ask", label: "Ask each time" },
  { mode: "organize", label: "Organize now" },
  { mode: "later", label: "Save for later" },
];

function Count({ value, label }: { value: number | string; label: string }) {
  return (
    <View className="flex-1 items-center">
      <Text className="text-lg font-bold">{value}</Text>
      <Text className="text-xs text-muted-foreground">{label}</Text>
    </View>
  );
}

/** Who you are and how you are doing: avatar initial, name, counts, bio and how much of the library is filed. */
function ProfileCard() {
  const me = useMe();
  const account = useActiveAccount();
  const progress = useProgress();
  const name = me.data?.name ?? account?.name ?? "";
  const profile = useProfile(me.data?.name ?? "");
  const updateBio = useUpdateBio();
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState("");
  const p = progress.data;
  const serverBio = profile.data?.bio ?? "";
  useEffect(() => {
    setBio(serverBio);
  }, [serverBio]);

  const save = () => {
    updateBio.mutate(bio.trim() === "" ? null : bio.trim(), {
      onSuccess: () => {
        setEditing(false);
      },
      onError: (e) => {
        alert("Failed", e.message);
      },
    });
  };

  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-4">
      <View className="flex-row items-center gap-3">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-primary">
          <Text className="text-2xl font-bold text-primary-foreground">{(me.data ? accountLabel(me.data) : name).charAt(0).toUpperCase() || "?"}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-lg font-semibold" numberOfLines={1}>
            {me.data ? accountLabel(me.data) : name}
          </Text>
          <Text className="text-sm text-muted-foreground" numberOfLines={1}>
            @{name}
            {me.data?.isAdmin ? " · admin" : ""}
          </Text>
        </View>
      </View>

      <View className="flex-row">
        <Count value={p?.itemsImported ?? "–"} label="items" />
        <Count value={p?.publicItems ?? "–"} label="shared" />
        <Count value={p?.followers ?? "–"} label="followers" />
        <Count value={p?.following ?? "–"} label="following" />
      </View>

      {editing ? (
        <View className="gap-2">
          <Input value={bio} onChangeText={setBio} placeholder="A line about you (public)" maxLength={500} multiline />
          <View className="flex-row gap-2">
            <Button size="sm" className="flex-1" disabled={updateBio.isPending} onPress={save}>
              <Text>Save</Text>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onPress={() => {
                setBio(serverBio);
                setEditing(false);
              }}
            >
              <Text>Cancel</Text>
            </Button>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => {
            setEditing(true);
          }}
        >
          <Text className={serverBio ? "text-sm" : "text-sm text-primary"}>{serverBio || "Add a bio"}</Text>
        </Pressable>
      )}

      {p ? (
        <View className="gap-1.5">
          <View className="flex-row items-baseline justify-between">
            <Text className="text-sm font-medium">Library filed</Text>
            <Text className="text-xs text-muted-foreground">
              {percent(p.filedShare)}
              {p.activeWeeks > 0 ? ` · ${String(p.activeWeeks)} week${p.activeWeeks === 1 ? "" : "s"} in a row` : ""}
            </Text>
          </View>
          <ProgressBar fraction={p.filedShare} trackClassName="bg-muted" fillClassName="bg-primary" />
        </View>
      ) : null}
      {p && p.awaitingFeedback > 0 ? (
        <Text className="text-xs text-muted-foreground">
          {p.awaitingFeedback} saved post{p.awaitingFeedback === 1 ? " is" : "s are"} waiting for your "how did it go?" answer. Find it at the top of Explore.
        </Text>
      ) : null}
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const settings = useSettings();
  const account = useActiveAccount();
  const setRole = useAccounts((s) => s.setRole);
  const me = useMe();
  const notifications = useNotifications();
  const updateName = useUpdateDisplayName();
  const setPasswordMutation = useSetPassword();
  const qc = useQueryClient();
  const saveAccount = useAccounts((s) => s.save);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [displayName, setDisplayName] = useState("");

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

  const go = (path: Parameters<typeof router.push>[0]) => () => {
    router.push(path);
  };
  const name = me.data?.name;

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 p-4 pb-24" keyboardShouldPersistTaps="handled">
      <ProfileCard />

      <Section title="Activity">
        <Row icon={Bell} label="Notifications" badge={notifications.data?.unreadCount} onPress={go("/notifications")} />
        <Row icon={MessageSquareHeart} label="Feedback" onPress={go("/feedback")} />
        <Row icon={Bookmark} label="Saved posts" onPress={go("/saved")} />
        <Row icon={Sparkles} label="Topics in my library" onPress={go("/topics")} />
        <Row icon={Compass} label="Filed for you" onPress={go("/auto-filed")} />
        {name ? <Row icon={UserRound} label="Public profile" onPress={() => { router.push({ pathname: "/profile/[name]", params: { name } }); }} /> : null}
        <Row icon={UserX} label="Blocked people" onPress={go("/blocked")} />
      </Section>

      <Section title="Version and updates">
        <Panel>
          <AppVersionCard />
        </Panel>
      </Section>

      <Section title="Account">
        <Panel>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {account?.url}
          </Text>
          {me.data?.storage ? <StorageMeter storage={me.data.storage} /> : null}
          {me.data ? (
            <View className="gap-1">
              <Text className="text-sm text-muted-foreground">Display name</Text>
              <Input value={displayName} onChangeText={setDisplayName} onBlur={saveName} placeholder={me.data.name} autoCapitalize="words" />
              <Text className="text-xs text-muted-foreground">Shown instead of your username. Leave empty to use the username.</Text>
            </View>
          ) : null}
        </Panel>
        <Row icon={Users} label="Switch or add account" onPress={go("/accounts")} />
        <Row icon={EyeOff} label="Ignored keywords" onPress={go("/stop-terms")} />
        {me.data ? (
          <Panel>
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
          </Panel>
        ) : null}
      </Section>

      {me.data ? <IdentitiesSection /> : null}

      <Section title="Sharing" hint={"Android's share sheet has two Magpie entries. \"Magpie: save for later\" always parks the link in your Inbox and returns you to the app you came from; plain \"Magpie\" does what you pick here."}>
        <Panel>
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
        </Panel>
      </Section>

      <Section title="Appearance">
        <Panel>
          <Text className="text-sm text-muted-foreground">Theme</Text>
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
        </Panel>
        <Panel>
          <Text className="text-sm text-muted-foreground">Items are shown as</Text>
          <View className="flex-row gap-2">
            {VIEWS.map((v) => (
              <Chip
                key={v.mode}
                label={v.label}
                active={settings.viewMode === v.mode}
                onPress={() => {
                  settings.setViewMode(v.mode);
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
        </Panel>
      </Section>

      {account?.isAdmin ? (
        <Section title="Administration">
          <Row icon={UserCog} label="Manage users" onPress={go("/admin")} />
          <Row icon={Camera} label="Instagram login" onPress={go("/credentials")} />
          <Row icon={ShieldAlert} label="Reports, hidden posts and invite codes" onPress={go("/moderation")} />
        </Section>
      ) : null}

      {me.data ? (
        <Section title="Danger zone">
          <Panel>
            <DeleteAccountSection username={me.data.name} isRoot={me.data.id === ROOT_ADMIN_ID} />
          </Panel>
        </Section>
      ) : null}

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
