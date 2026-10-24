import { buildFolderTree, flattenFolderTree, type ItemDetail, type Workflow } from "@magpie/shared/api";
import { Stack, useRouter } from "expo-router";
import { CheckCheck } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { alert } from "@/lib/alert";
import { Chip } from "@/components/chip";
import { OptionPicker } from "@/components/option-picker";
import { Image, SafeAreaView } from "@/components/styled";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  useCreateFolder,
  useCreateTag,
  useFolders,
  useItem,
  useItems,
  useSetItemFolders,
  useSetItemTags,
  useStats,
  useSuggestionsAction,
  useTags,
  useUpdateItem,
} from "@/lib/queries";
import { WORKFLOW_META } from "@/lib/workflow";

type Ref = { id: string; name: string };

// the three answers to "what is this for?"; each one files the item and moves on
const ANSWERS: readonly Workflow[] = ["to_try", "reference", "done"];

function Card({ item, onNext }: { item: ItemDetail; onNext: () => void }) {
  const router = useRouter();
  const folders = useFolders();
  const tags = useTags();
  const setFolders = useSetItemFolders(item.id);
  const setTags = useSetItemTags(item.id);
  const dismiss = useSuggestionsAction(item.id, "dismiss");
  const update = useUpdateItem(item.id);
  const createFolder = useCreateFolder();
  const createTag = useCreateTag();

  const [folderChips, setFolderChips] = useState<Ref[]>(item.suggestions.folders.map((s) => ({ id: s.id, name: s.name })));
  const [tagChips, setTagChips] = useState<Ref[]>(item.suggestions.tags.map((s) => ({ id: s.id, name: s.name })));
  // suggestions start selected: accepting is the fast path, a wrong one is one tap to drop
  const [pickedFolders, setPickedFolders] = useState<Set<string>>(new Set(item.suggestions.folders.map((s) => s.id)));
  const [pickedTags, setPickedTags] = useState<Set<string>>(new Set(item.suggestions.tags.map((s) => s.id)));
  const [picking, setPicking] = useState<"folder" | "tag" | null>(null);
  const [busy, setBusy] = useState(false);

  const folderOptions = useMemo(
    () => flattenFolderTree(buildFolderTree(folders.data ?? [])).map((f) => ({ id: f.id, label: f.name, depth: f.depth })),
    [folders.data],
  );
  const tagOptions = useMemo(() => (tags.data ?? []).map((t) => ({ id: t.id, label: t.name })), [tags.data]);

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (!next.delete(id)) next.add(id);
    return next;
  };

  const answer = async (workflow: Workflow) => {
    setBusy(true);
    try {
      if (pickedFolders.size > 0) await setFolders.mutateAsync([...new Set([...item.folders.map((f) => f.id), ...pickedFolders])]);
      if (pickedTags.size > 0) await setTags.mutateAsync([...new Set([...item.tags.map((t) => t.id), ...pickedTags])]);
      if (item.suggestions.folders.length + item.suggestions.tags.length > 0) await dismiss.mutateAsync({});
      await update.mutateAsync({ workflow });
      onNext();
    } catch (e) {
      alert("Failed", e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const addRef = (kind: "folder" | "tag", id: string, name: string) => {
    if (kind === "folder") {
      setFolderChips((c) => (c.some((x) => x.id === id) ? c : [...c, { id, name }]));
      setPickedFolders((s) => new Set(s).add(id));
    } else {
      setTagChips((c) => (c.some((x) => x.id === id) ? c : [...c, { id, name }]));
      setPickedTags((s) => new Set(s).add(id));
    }
  };

  const already = [...item.folders.map((f) => f.name), ...item.tags.map((t) => `#${t.name}`)];
  const downloading = item.fetchStatus === "pending" || item.fetchStatus === "fetching";

  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-background">
      <ScrollView className="flex-1" contentContainerClassName="gap-4 p-4" keyboardShouldPersistTaps="handled">
        {item.thumbUrl ? (
          <Image source={{ uri: item.thumbUrl }} className="aspect-square w-full rounded-xl bg-muted" contentFit="cover" />
        ) : (
          <View className="aspect-video w-full items-center justify-center rounded-xl bg-muted">
            {downloading ? <ActivityIndicator /> : <Text className="text-muted-foreground">No preview</Text>}
          </View>
        )}
        <View className="gap-1">
          {item.title ? <Text className="text-lg font-semibold">{item.title}</Text> : null}
          {item.caption ? (
            <Text className="text-sm text-muted-foreground" numberOfLines={4}>
              {item.caption}
            </Text>
          ) : null}
          <Text className="text-xs text-muted-foreground">
            {[item.authorHandle ? `@${item.authorHandle}` : null, item.source].filter(Boolean).join(" · ")}
          </Text>
        </View>

        <View className="gap-2">
          <Text className="text-xs font-semibold uppercase text-muted-foreground">Tags</Text>
          <View className="flex-row flex-wrap items-center gap-2">
            {tagChips.map((t) => (
              <Chip
                key={t.id}
                label={`#${t.name}`}
                active={pickedTags.has(t.id)}
                onPress={() => {
                  setPickedTags((s) => toggle(s, t.id));
                }}
              />
            ))}
            <Chip label="+ Tag" onPress={() => { setPicking("tag"); }} />
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-xs font-semibold uppercase text-muted-foreground">Folders</Text>
          <View className="flex-row flex-wrap items-center gap-2">
            {folderChips.map((f) => (
              <Chip
                key={f.id}
                label={f.name}
                active={pickedFolders.has(f.id)}
                onPress={() => {
                  setPickedFolders((s) => toggle(s, f.id));
                }}
              />
            ))}
            <Chip label="+ Folder" onPress={() => { setPicking("folder"); }} />
          </View>
        </View>

        {already.length > 0 && <Text className="text-xs text-muted-foreground">Already in: {already.join(", ")}</Text>}
        {item.suggestions.folders.length + item.suggestions.tags.length === 0 && tagChips.length + folderChips.length === 0 && (
          <Text className="text-xs text-muted-foreground">No suggestions yet. Add a tag or folder, or just say what this is for.</Text>
        )}
      </ScrollView>

      <View className="gap-2 border-t border-border bg-card p-3">
        <Text className="text-center text-xs text-muted-foreground">Save with the chosen tags and folders as…</Text>
        <View className="flex-row gap-2">
          {ANSWERS.map((w) => (
            <Button key={w} className="flex-1" disabled={busy} onPress={() => { void answer(w); }}>
              <Text>{WORKFLOW_META[w].label}</Text>
            </Button>
          ))}
        </View>
        <View className="flex-row gap-2">
          <Button variant="ghost" className="flex-1" disabled={busy} onPress={onNext}>
            <Text>Skip for now</Text>
          </Button>
          <Button
            variant="ghost"
            className="flex-1"
            onPress={() => {
              router.push({ pathname: "/item/[id]", params: { id: item.id } });
            }}
          >
            <Text>Open</Text>
          </Button>
        </View>
      </View>

      {picking === "folder" && (
        <OptionPicker
          visible
          multiple={false}
          title="Add to folder"
          options={folderOptions}
          onCreate={async (name) => (await createFolder.mutateAsync({ name })).id}
          onClose={() => { setPicking(null); }}
          onDone={([id]) => {
            setPicking(null);
            const name = folderOptions.find((o) => o.id === id)?.label ?? (folders.data ?? []).find((f) => f.id === id)?.name;
            if (id) addRef("folder", id, name ?? "Folder");
          }}
        />
      )}
      {picking === "tag" && (
        <OptionPicker
          visible
          multiple={false}
          title="Add tag"
          options={tagOptions}
          onCreate={async (name) => (await createTag.mutateAsync({ name })).id}
          onClose={() => { setPicking(null); }}
          onDone={([id]) => {
            setPicking(null);
            const name = tagOptions.find((o) => o.id === id)?.label ?? (tags.data ?? []).find((t) => t.id === id)?.name;
            if (id) addRef("tag", id, name ?? "tag");
          }}
        />
      )}
    </SafeAreaView>
  );
}

function Current({ id, onNext }: { id: string; onNext: () => void }) {
  const item = useItem(id);
  if (!item.data) return <ActivityIndicator className="mt-20" />;
  // keyed so the chip selection starts fresh for every item
  return <Card key={item.data.id} item={item.data} onNext={onNext} />;
}

/** One item at a time: pick tags and folders (suggested ones are already on), say what it is for, next. */
export default function TriageScreen() {
  const router = useRouter();
  const stats = useStats();
  const list = useItems({ filter: { workflow: "inbox" } });
  const [passed, setPassed] = useState<Set<string>>(new Set());

  const flat = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const current = flat.find((i) => !passed.has(i.id));
  const left = Math.max(0, (stats.data?.byWorkflow.inbox ?? flat.length) - passed.size);

  // everything loaded so far was passed: look further back
  useEffect(() => {
    if (!current && list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
  }, [current, list]);

  return (
    <>
      <Stack.Screen options={{ title: left > 0 ? `Sort · ${left} left` : "Sort" }} />
      {current ? (
        <Current
          key={current.id}
          id={current.id}
          onNext={() => {
            setPassed((p) => new Set(p).add(current.id));
          }}
        />
      ) : list.isLoading || list.hasNextPage ? (
        <ActivityIndicator className="mt-20" />
      ) : (
        <View className="flex-1 items-center justify-center gap-3 p-8">
          <Icon as={CheckCheck} size={40} className="text-primary" />
          <Text className="text-lg font-semibold">All sorted</Text>
          <Text className="text-center text-muted-foreground">
            {passed.size > 0 ? "Items you skipped stay in To sort." : "Nothing is waiting to be sorted."}
          </Text>
          <Button
            onPress={() => {
              router.back();
            }}
          >
            <Text>Back</Text>
          </Button>
        </View>
      )}
    </>
  );
}
