import type { ItemFilter, ItemKind } from "@magpie/shared/api";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { ActAsBanner } from "@/components/account-chrome";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { Chip } from "@/components/chip";
import { ItemBrowser } from "@/components/item-browser";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { installLabel, useInstallUpdate } from "@/lib/install-update";
import { useMe } from "@/lib/queries";
import { useUpdateCheck } from "@/lib/updates";
import { extractUrl } from "@/lib/media";
import { useSaveLink } from "@/lib/queries";

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
  const save = useSaveLink();
  const update = useUpdateCheck();
  const available = update.data;
  const me = useMe();
  const router = useRouter();
  const install = useInstallUpdate(available);
  const q = useDebounced(text.trim(), 300);

  const filter = useMemo<ItemFilter>(
    () => ({
      ...(q ? { q } : {}),
      ...(favorite ? { favorite: true } : {}),
      ...(kind ? { kinds: [kind] } : {}),
    }),
    [q, favorite, kind],
  );

  const pasteLink = async () => {
    const url = extractUrl(await Clipboard.getStringAsync());
    if (!url) {
      Alert.alert("No link", "Copy a link first, then tap again.");
      return;
    }
    save.mutate({ url }, { onSuccess: ({ duplicate }) => { if (duplicate) Alert.alert("Already saved", "That link is already in your library."); }, onError: (e) => { Alert.alert("Couldn't save", e.message); } });
  };


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
        <Pressable
          onPress={() => {
            void install.start();
          }}
          className="mx-3 mt-2 rounded-lg bg-primary px-3 py-2"
        >
          <Text className="text-sm text-primary-foreground">{install.state.status === "idle" ? `Update available: Magpie ${available.version}. Tap to install.` : installLabel(install.state, available.version)}</Text>
        </Pressable>
      ) : null}
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
          <Chip label="+ Paste link" onPress={() => { void pasteLink(); }} />
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
