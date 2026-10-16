import { buildFolderTree, flattenFolderTree } from "@magpie/shared/api";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { CheckCircle2, CircleAlert, Copy } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { Chip } from "@/components/chip";
import { OptionPicker } from "@/components/option-picker";
import { SafeAreaView } from "@/components/styled";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { extractUrls } from "@/lib/media";
import { useCreateFolder, useCreateTag, useFolders, useSaveLink, useTags } from "@/lib/queries";

type Outcome =
  | { url: string; status: "saved" | "duplicate"; itemId: string }
  | { url: string; status: "error"; message: string };

function describe(r: Outcome): string {
  if (r.status === "error") return r.message;
  return r.status === "saved" ? "Saved" : "Already in your library (tap to open)";
}

/** Save one or more links by hand: paste or type, optionally file them right away. */
export default function AddLinkScreen() {
  const router = useRouter();
  const save = useSaveLink();
  const folders = useFolders();
  const tags = useTags();
  const createFolder = useCreateFolder();
  const createTag = useCreateTag();
  const [text, setText] = useState("");
  const [notes, setNotes] = useState("");
  const [folderIds, setFolderIds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [picking, setPicking] = useState<"folders" | "tags" | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Outcome[] | null>(null);

  // start from whatever links are on the clipboard, but leave the text editable
  useEffect(() => {
    void Clipboard.getStringAsync().then((clip) => {
      if (extractUrls(clip).length > 0) setText((current) => (current.trim() === "" ? clip.trim() : current));
    });
  }, []);

  const urls = useMemo(() => extractUrls(text), [text]);
  const folderOptions = useMemo(
    () => flattenFolderTree(buildFolderTree(folders.data ?? [])).map((f) => ({ id: f.id, label: f.name, depth: f.depth })),
    [folders.data],
  );
  const tagOptions = useMemo(() => (tags.data ?? []).map((t) => ({ id: t.id, label: t.name })), [tags.data]);

  const paste = async () => {
    const clip = await Clipboard.getStringAsync();
    if (clip.trim() === "") return;
    setText((current) => (current.trim() === "" ? clip.trim() : `${current.trimEnd()}\n${clip.trim()}`));
  };

  const run = async () => {
    setBusy(true);
    const out: Outcome[] = [];
    // one at a time: the server rate-limits saves and the order is easy to follow
    for (const url of urls) {
      try {
        const { item, duplicate } = await save.mutateAsync({
          url,
          ...(folderIds.length ? { folderIds } : {}),
          ...(tagIds.length ? { tagIds } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        });
        out.push({ url, status: duplicate ? "duplicate" : "saved", itemId: item.id });
      } catch (e) {
        out.push({ url, status: "error", message: e instanceof Error ? e.message : "Failed" });
      }
    }
    setResults(out);
    setBusy(false);
    const failed = out.filter((o) => o.status === "error");
    // a clean single save just opens the item; anything else stays so the outcome can be read
    const only = out[0];
    if (out.length === 1 && only && only.status === "saved") {
      router.replace({ pathname: "/item/[id]", params: { id: only.itemId } });
    } else if (failed.length === 0) {
      setText("");
    } else {
      // keep only the links that failed so they can be fixed and retried
      setText(failed.map((f) => f.url).join("\n"));
    }
  };

  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-background">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerClassName="gap-3 p-4" keyboardShouldPersistTaps="handled">
          <Input
            value={text}
            onChangeText={(t) => {
              setText(t);
              setResults(null);
            }}
            placeholder="Paste or type links, one per line"
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            textAlignVertical="top"
            className="h-32 py-2"
          />
          <View className="flex-row items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onPress={() => {
                void paste();
              }}
            >
              <Icon as={Copy} size={16} />
              <Text>Paste</Text>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onPress={() => {
                setText("");
                setResults(null);
              }}
            >
              <Text>Clear</Text>
            </Button>
            <Text className="ml-auto text-sm text-muted-foreground">
              {urls.length === 0 ? "No links yet" : urls.length === 1 ? "1 link" : `${urls.length} links`}
            </Text>
          </View>

          <View className="flex-row flex-wrap gap-2">
            <Chip
              label={folderIds.length ? `Folders (${folderIds.length})` : "Add to folders"}
              active={folderIds.length > 0}
              onPress={() => {
                setPicking("folders");
              }}
            />
            <Chip
              label={tagIds.length ? `Tags (${tagIds.length})` : "Add tags"}
              active={tagIds.length > 0}
              onPress={() => {
                setPicking("tags");
              }}
            />
          </View>
          <Input value={notes} onChangeText={setNotes} placeholder="Notes (optional, added to every link)" multiline className="h-20 py-2" textAlignVertical="top" />

          <Button
            disabled={busy || urls.length === 0}
            onPress={() => {
              void run();
            }}
          >
            <Text>{busy ? "Saving…" : urls.length > 1 ? `Save ${urls.length} links` : "Save link"}</Text>
          </Button>

          {results?.map((r) => (
            <Pressable
              key={r.url}
              disabled={r.status === "error"}
              onPress={() => {
                if (r.status !== "error") router.push({ pathname: "/item/[id]", params: { id: r.itemId } });
              }}
              className="flex-row items-start gap-2 rounded-lg border border-border p-3 active:bg-accent"
            >
              <Icon
                as={r.status === "error" ? CircleAlert : CheckCircle2}
                className={r.status === "error" ? "text-destructive" : "text-primary"}
                size={18}
              />
              <View className="flex-1">
                <Text className="text-sm font-medium">
                  {describe(r)}
                </Text>
                <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                  {r.url}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>

      {picking === "folders" && (
        <OptionPicker
          visible
          multiple
          title="Folders"
          options={folderOptions}
          selected={folderIds}
          onCreate={async (name) => (await createFolder.mutateAsync({ name })).id}
          onClose={() => {
            setPicking(null);
          }}
          onDone={(ids) => {
            setPicking(null);
            setFolderIds(ids);
          }}
        />
      )}
      {picking === "tags" && (
        <OptionPicker
          visible
          multiple
          title="Tags"
          options={tagOptions}
          selected={tagIds}
          onCreate={async (name) => (await createTag.mutateAsync({ name })).id}
          onClose={() => {
            setPicking(null);
          }}
          onDone={(ids) => {
            setPicking(null);
            setTagIds(ids);
          }}
        />
      )}
    </SafeAreaView>
  );
}
