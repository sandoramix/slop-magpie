import type { LucideIcon } from "lucide-react-native";
import { useRouter } from "expo-router";
import { Bell, Bookmark, MessageSquareHeart, Settings, UserRound, UserX } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { ActAsBanner } from "@/components/account-chrome";
import { ProgressBar } from "@/components/progress-bar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { alert } from "@/lib/alert";
import { useMe } from "@/lib/queries";
import { percent } from "@/lib/social";
import { useNotifications, useProfile, useProgress, useUpdateBio } from "@/lib/social-queries";

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View className="min-w-[30%] flex-1 gap-0.5 rounded-xl border border-border bg-card p-3">
      <Text className="text-xl font-bold">{value}</Text>
      <Text className="text-xs text-muted-foreground">{label}</Text>
    </View>
  );
}

function LinkRow({ icon, label, detail, onPress }: { icon: LucideIcon; label: string; detail?: string | undefined; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3 border-b border-border px-4 py-3.5">
      <Icon as={icon} size={20} className="text-muted-foreground" />
      <Text className="flex-1">{label}</Text>
      {detail ? <Text className="text-sm text-primary">{detail}</Text> : null}
    </Pressable>
  );
}

/** Progress and everything you gave or received: the home of the social side. */
export default function MeScreen() {
  const router = useRouter();
  const me = useMe();
  const progress = useProgress();
  const notifications = useNotifications();
  const profile = useProfile(me.data?.name ?? "");
  const updateBio = useUpdateBio();
  const [bio, setBio] = useState("");

  const serverBio = profile.data?.bio ?? "";
  useEffect(() => {
    setBio(serverBio);
  }, [serverBio]);

  const p = progress.data;
  const unread = notifications.data?.unreadCount ?? 0;
  const name = me.data?.name;

  return (
    <View className="flex-1 bg-background">
      <ActAsBanner />
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={progress.isRefetching}
            onRefresh={() => {
              void progress.refetch();
              void notifications.refetch();
            }}
          />
        }
      >
        <View className="gap-1 p-4">
          <Text className="text-2xl font-bold">{me.data?.displayName ?? name ?? "Me"}</Text>
          {name ? <Text className="text-sm text-muted-foreground">@{name}</Text> : null}
        </View>

        {p && (
          <View className="gap-3 px-4 pb-4">
            <View className="gap-2 rounded-xl border border-border bg-card p-4">
              <View className="flex-row items-baseline justify-between">
                <Text className="font-semibold">Library filed</Text>
                <Text className="text-sm text-muted-foreground">
                  {percent(p.filedShare)} of {p.itemsImported}
                </Text>
              </View>
              <ProgressBar fraction={p.filedShare} trackClassName="bg-muted" fillClassName="bg-primary" />
              <Text className="text-xs text-muted-foreground">
                {p.activeWeeks > 0 ? `${p.activeWeeks} week${p.activeWeeks === 1 ? "" : "s"} in a row with activity.` : "Save, file or answer something to start a streak."}
              </Text>
            </View>

            <View className="flex-row flex-wrap gap-2">
              <Stat value={String(p.publicItems)} label="shared posts" />
              <Stat value={String(p.savesFromOthers)} label="saves from others" />
              <Stat value={String(p.followers)} label="followers" />
              <Stat value={String(p.feedbackGiven)} label="answers given" />
              <Stat value={String(p.feedbackReceived)} label="answers received" />
              <Stat value={p.helpfulShare === null ? "–" : percent(p.helpfulShare)} label="said it worked" />
            </View>

            {p.awaitingFeedback > 0 && (
              <Pressable
                onPress={() => {
                  router.push("/(tabs)/explore");
                }}
                className="rounded-xl bg-primary p-4"
              >
                <Text className="font-semibold text-primary-foreground">
                  {p.awaitingFeedback} saved post{p.awaitingFeedback === 1 ? "" : "s"} waiting for your answer
                </Text>
                <Text className="text-xs text-primary-foreground/80">Did it work out? One tap.</Text>
              </Pressable>
            )}
          </View>
        )}

        <View className="gap-2 px-4 pb-4">
          <Text className="text-xs font-semibold uppercase text-muted-foreground">About you</Text>
          <Input value={bio} onChangeText={setBio} placeholder="A line about you (public)" maxLength={500} multiline />
          {bio.trim() !== serverBio ? (
            <Button
              size="sm"
              disabled={updateBio.isPending}
              onPress={() => {
                updateBio.mutate(bio.trim() === "" ? null : bio.trim(), { onError: (e) => { alert("Failed", e.message); } });
              }}
            >
              <Text>Save</Text>
            </Button>
          ) : null}
        </View>

        <LinkRow
          icon={MessageSquareHeart}
          label="Feedback"
          detail={p ? `${p.feedbackGiven} given · ${p.feedbackReceived} received` : undefined}
          onPress={() => {
            router.push("/feedback");
          }}
        />
        <LinkRow
          icon={Bookmark}
          label="Saved posts"
          onPress={() => {
            router.push("/saved");
          }}
        />
        <LinkRow
          icon={Bell}
          label="Notifications"
          detail={unread > 0 ? `${unread} new` : undefined}
          onPress={() => {
            router.push("/notifications");
          }}
        />
        {name ? (
          <LinkRow
            icon={UserRound}
            label="Your public profile"
            onPress={() => {
              router.push({ pathname: "/profile/[name]", params: { name } });
            }}
          />
        ) : null}
        <LinkRow
          icon={UserX}
          label="Blocked people"
          onPress={() => {
            router.push("/blocked");
          }}
        />
        <LinkRow
          icon={Settings}
          label="Settings"
          onPress={() => {
            router.push("/(tabs)/settings");
          }}
        />
        <View className="h-16" />
      </ScrollView>
    </View>
  );
}
