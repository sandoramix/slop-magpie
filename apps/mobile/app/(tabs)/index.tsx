import type { ItemFilter, ItemKind } from "@magpie/shared/api";
import { useRouter } from "expo-router";
import { ActAsBanner } from "@/components/account-chrome";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { AutoFiledBanner } from "@/components/auto-filed-banner";
import { Chip } from "@/components/chip";
import { ItemBrowser } from "@/components/item-browser";
import { UpdateCard } from "@/components/update-card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { alert } from "@/lib/alert";
import { startInstall } from "@/lib/install-update";
import { useMe } from "@/lib/queries";
import { useUpdateCheck } from "@/lib/updates";

/** Versions already offered in a dialog during this app launch. */
const promptedVersions = new Set<string>();

const KINDS: { kind: ItemKind; label: string }[] = [
  { kind: "video", label: "Videos" },
  { kind: "image", label: "Images" },
  { kind: "gallery", label: "Galleries" },
  { kind: "link", label: "Links" },
];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => {
      setV(value);
    }, ms);
    return () => {
      clearTimeout(t);
    };
  }, [value, ms]);
  return v;
}

export default function Library() {
  const [text, setText] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [kind, setKind] = useState<ItemKind | null>(null);
  const update = useUpdateCheck();
  const available = update.data;
  const me = useMe();
  const router = useRouter();
  const q = useDebounced(text.trim(), 300);

  // The banner is easy to scroll past and old builds can stop matching the server, so ask once per launch.
  useEffect(() => {
    if (!available || promptedVersions.has(available.version)) return;
    promptedVersions.add(available.version);
    alert(
      `Update to Magpie ${available.version}`,
      "A new version is ready. Updating keeps the app in step with your server; old versions may stop working.",
      [
        { text: "Later", style: "cancel" },
        {
          text: "Update now",
          onPress: () => {
            void startInstall(available);
          },
        },
      ],
    );
  }, [available]);

  const filter = useMemo<ItemFilter>(
    () => ({
      ...(q ? { q } : {}),
      ...(favorite ? { favorite: true } : {}),
      ...(kind ? { kinds: [kind] } : {}),
    }),
    [q, favorite, kind],
  );


  return (
    <View className="flex-1 bg-background">
      <ActAsBanner />
      {me.data && !me.data.isAdmin && !me.data.hasPassword ? (
        <Pressable
          onPress={() => {
            router.navigate("/settings");
          }}
          className="mx-3 mt-2 rounded-lg border border-primary px-3 py-2"
        >
          <Text className="text-sm">Choose a password to finish setting up your account. Tap here.</Text>
        </Pressable>
      ) : null}
      {available ? (
        <UpdateCard update={available} className="mx-3 mt-2" />
      ) : null}
      <AutoFiledBanner />
      <View className="gap-2 px-3 pb-1 pt-2">
        <Input
          value={text}
          onChangeText={setText}
          placeholder="Search…  tag:food  is:fav  from:@name"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
          <Chip
            label="Favorites"
            active={favorite}
            onPress={() => {
              setFavorite((f) => !f);
            }}
          />
          {KINDS.map((k) => (
            <Chip
              key={k.kind}
              label={k.label}
              active={kind === k.kind}
              onPress={() => {
                setKind((cur) => (cur === k.kind ? null : k.kind));
              }}
            />
          ))}
        </ScrollView>
      </View>
      <ItemBrowser
        query={{ filter }}
        empty={q || favorite || kind ? "No matches" : "Nothing saved yet. Share a link to Magpie from any app."}
      />
    </View>
  );
}
