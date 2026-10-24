import { buildFolderTree, flattenFolderTree, type Workflow } from "@magpie/shared/api";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { alert } from "@/lib/alert";
import { Chip } from "@/components/chip";
import { ImportPreview } from "@/components/import-preview";
import { OptionPicker } from "@/components/option-picker";
import { SafeAreaView } from "@/components/styled";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useCreateFolder, useCreateTag, useFolders, useItem, useSetItemFolders, useSetItemTags, useTags, useUpdateItem } from "@/lib/queries";
import { WORKFLOW_META } from "@/lib/workflow";

const PURPOSES: readonly Workflow[] = ["inbox", "to_try", "reference", "done"];
const SHOWN = 12;

/** Right after sharing a link: tap the tags and folders you use most, say what it is for, done. */
export default function QuickTagScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useItem(id);
  const tags = useTags();
  const folders = useFolders();
  const setTags = useSetItemTags(id);
  const setFolders = useSetItemFolders(id);
  const update = useUpdateItem(id);
  const createTag = useCreateTag();
  const createFolder = useCreateFolder();
  const [tagIds, setTagIds] = useState<Set<string>>(new Set());
  const [folderIds, setFolderIds] = useState<Set<string>>(new Set());
  const [purpose, setPurpose] = useState<Workflow>("inbox");
  const [picking, setPicking] = useState<"tag" | "folder" | null>(null);
  const [busy, setBusy] = useState(false);

  // most used first: what you filed before is what you will file again
  const topTags = useMemo(() => [...(tags.data ?? [])].sort((a, b) => b.itemCount - a.itemCount).slice(0, SHOWN), [tags.data]);
  const topFolders = useMemo(() => [...(folders.data ?? [])].sort((a, b) => b.itemCount - a.itemCount).slice(0, SHOWN), [folders.data]);
  const tagOptions = useMemo(() => (tags.data ?? []).map((t) => ({ id: t.id, label: t.name })), [tags.data]);
  const folderOptions = useMemo(
    () => flattenFolderTree(buildFolderTree(folders.data ?? [])).map((f) => ({ id: f.id, label: f.name, depth: f.depth })),
    [folders.data],
  );

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (!next.delete(key)) next.add(key);
    return next;
  };
  // picked from the full list: show it even when it is not among the most used
  const shownTags = [...topTags, ...(tags.data ?? []).filter((t) => tagIds.has(t.id) && !topTags.some((x) => x.id === t.id))];
  const shownFolders = [...topFolders, ...(folders.data ?? []).filter((f) => folderIds.has(f.id) && !topFolders.some((x) => x.id === f.id))];

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  const save = async () => {
    setBusy(true);
    try {
      if (tagIds.size > 0) await setTags.mutateAsync([...tagIds]);
      if (folderIds.size > 0) await setFolders.mutateAsync([...folderIds]);
      if (purpose !== "inbox") await update.mutateAsync({ workflow: purpose });
      leave();
    } catch (e) {
      alert("Failed", e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-background">
      <Stack.Screen options={{ title: "Saved. File it?" }} />
      <ScrollView contentContainerClassName="gap-4 p-4" keyboardShouldPersistTaps="handled">
        {item.data ? <ImportPreview item={item.data} /> : null}
        <View className="gap-2">
          <Text className="text-xs font-semibold uppercase text-muted-foreground">Tags</Text>
          <View className="flex-row flex-wrap items-center gap-2">
            {shownTags.map((t) => (
              <Chip key={t.id} label={`#${t.name}`} active={tagIds.has(t.id)} onPress={() => { setTagIds((s) => toggle(s, t.id)); }} />
            ))}
            <Chip label="+ Tag" onPress={() => { setPicking("tag"); }} />
          </View>
        </View>
        <View className="gap-2">
          <Text className="text-xs font-semibold uppercase text-muted-foreground">Folders</Text>
          <View className="flex-row flex-wrap items-center gap-2">
            {shownFolders.map((f) => (
              <Chip key={f.id} label={f.name} active={folderIds.has(f.id)} onPress={() => { setFolderIds((s) => toggle(s, f.id)); }} />
            ))}
            <Chip label="+ Folder" onPress={() => { setPicking("folder"); }} />
          </View>
        </View>
        <View className="gap-2">
          <Text className="text-xs font-semibold uppercase text-muted-foreground">What is it for?</Text>
          <View className="flex-row flex-wrap gap-2">
            {PURPOSES.map((w) => (
              <Chip key={w} label={WORKFLOW_META[w].label} active={purpose === w} onPress={() => { setPurpose(w); }} />
            ))}
          </View>
          <Text className="text-xs text-muted-foreground">{WORKFLOW_META[purpose].hint}</Text>
        </View>
        <Text className="text-xs text-muted-foreground">You can save now; the download continues in the background and suggestions appear when it finishes.</Text>
      </ScrollView>
      <View className="flex-row gap-2 border-t border-border bg-card p-3">
        <Button variant="ghost" className="flex-1" disabled={busy} onPress={leave}>
          <Text>Later</Text>
        </Button>
        <Button className="flex-1" disabled={busy} onPress={() => { void save(); }}>
          <Text>Save</Text>
        </Button>
      </View>

      {picking === "tag" && (
        <OptionPicker
          visible
          multiple={false}
          title="Add tag"
          options={tagOptions}
          onCreate={async (name) => (await createTag.mutateAsync({ name })).id}
          onClose={() => { setPicking(null); }}
          onDone={([tagId]) => {
            setPicking(null);
            if (tagId) setTagIds((s) => new Set(s).add(tagId));
          }}
        />
      )}
      {picking === "folder" && (
        <OptionPicker
          visible
          multiple={false}
          title="Add to folder"
          options={folderOptions}
          onCreate={async (name) => (await createFolder.mutateAsync({ name })).id}
          onClose={() => { setPicking(null); }}
          onDone={([folderId]) => {
            setPicking(null);
            if (folderId) setFolderIds((s) => new Set(s).add(folderId));
          }}
        />
      )}
    </SafeAreaView>
  );
}
