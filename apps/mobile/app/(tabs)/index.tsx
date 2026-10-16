import type { ItemFilter, ItemKind } from "@magpie/shared/api";
import * as Clipboard from "expo-clipboard";
import { useEffect, useMemo, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, View } from "react-native";
import { Chip } from "@/components/chip";
import { ItemBrowser } from "@/components/item-browser";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useUpdateCheck } from "@/lib/updates";
import { extractUrl } from "@/lib/media";
import { useSaveLink } from "@/lib/queries";
import { useAuth } from "@/stores/auth";
import { useSettings } from "@/stores/settings";
import { SetupNotice } from "@/components/setup-notice";

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
  const hasToken = useAuth((s) => s.token !== null);
  const hasUrl = useSettings((s) => s.apiUrl !== "");
  const [text, setText] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [kind, setKind] = useState<ItemKind | null>(null);
  const save = useSaveLink();
  const update = useUpdateCheck();
  const available = update.data;
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

  if (!hasToken || !hasUrl) return <SetupNotice />;

  return (
    <View className="flex-1 bg-background">
      {available ? (
        <Pressable
          onPress={() => {
            void Linking.openURL(available.url);
          }}
          className="mx-3 mt-2 rounded-lg bg-primary px-3 py-2"
        >
          <Text className="text-sm text-primary-foreground">Update available: Magpie {available.version}. Tap to download.</Text>
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
