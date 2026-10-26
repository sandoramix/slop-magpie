import { buildFolderTree, flattenFolderTree, type ItemDetail } from "@magpie/shared/api";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ExternalLink, Heart, RefreshCw, Star, Trash2 } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, View } from "react-native";
import { alert } from "@/lib/alert";
import { Chip } from "@/components/chip";
import { FieldEditor } from "@/components/field-editor";
import { OptionPicker } from "@/components/option-picker";
import { Image, SafeAreaView } from "@/components/styled";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { MediaCarousel } from "@/components/media-carousel";
import { SharedCommentCard } from "@/components/shared-comment-card";
import { WORKFLOW_META, WORKFLOW_ORDER } from "@/lib/workflow";
import {
  useCreateFolder,
  useCreateTag,
  useDeleteItem,
  useFields,
  useFolders,
  useItem,
  useRefetchItem,
  useSetItemFolders,
  useSetItemTags,
  useSuggestionsAction,
  useTags,
  useUpdateItem,
} from "@/lib/queries";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="text-xs font-semibold uppercase text-muted-foreground">{title}</Text>
      {children}
    </View>
  );
}

function Media({ item }: { item: ItemDetail }) {
  if (item.fetchStatus === "pending" || item.fetchStatus === "fetching") {
    return (
      <View className="aspect-video items-center justify-center gap-2 bg-muted">
        <ActivityIndicator />
        <Text className="text-sm text-muted-foreground">Downloading…</Text>
      </View>
    );
  }
  if (item.media.length === 0) {
    return item.thumbUrl ? (
      <Image source={{ uri: item.thumbUrl }} className="aspect-video w-full bg-muted" contentFit="cover" />
    ) : null;
  }
  return <MediaCarousel media={item.media} fallbackRatio={item.aspectRatio} />;
}

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const query = useItem(id);
  const item = query.data;

  if (!item) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-8">
        {query.isError ? (
          <>
            <Text className="mb-3 text-center text-muted-foreground">{query.error.message}</Text>
            <Button
              variant="outline"
              onPress={() => {
                void query.refetch();
              }}
            >
              <Text>Retry</Text>
            </Button>
          </>
        ) : (
          <ActivityIndicator />
        )}
      </View>
    );
  }
  return <Detail item={item} onDeleted={() => { router.back(); }} />;
}

function Detail({ item, onDeleted }: { item: ItemDetail; onDeleted: () => void }) {
  const update = useUpdateItem(item.id);
  const setFolders = useSetItemFolders(item.id);
  const setTags = useSetItemTags(item.id);
  const accept = useSuggestionsAction(item.id, "accept");
  const dismiss = useSuggestionsAction(item.id, "dismiss");
  const refetch = useRefetchItem(item.id);
  const remove = useDeleteItem();
  const folders = useFolders();
  const tags = useTags();
  const fields = useFields();
  const createFolder = useCreateFolder();
  const createTag = useCreateTag();
  const [title, setTitle] = useState(item.title ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");
  const [picking, setPicking] = useState<"folders" | "tags" | null>(null);

  const folderOptions = useMemo(
    () => flattenFolderTree(buildFolderTree(folders.data ?? [])).map((f) => ({ id: f.id, label: f.name, depth: f.depth })),
    [folders.data],
  );
  const tagOptions = useMemo(() => (tags.data ?? []).map((t) => ({ id: t.id, label: t.name })), [tags.data]);

  const fail = (e: Error) => {
    alert("Failed", e.message);
  };
  const patch = (body: Parameters<typeof update.mutate>[0]) => {
    update.mutate(body, { onError: fail });
  };

  const confirmDelete = () => {
    alert("Delete this item?", "The item and its downloaded files are removed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          remove.mutate(item.id, { onSuccess: onDeleted, onError: fail });
        },
      },
    ]);
  };

  const hasSuggestions = item.suggestions.folders.length + item.suggestions.tags.length > 0;

  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-background">
    <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: item.authorHandle ? `@${item.authorHandle}` : item.source }} />
      <Media item={item} />

      <View className="gap-5 p-4 pb-16">
        {item.fetchStatus === "failed" && (
          <View className="gap-2 rounded-lg border border-destructive p-3">
            <Text className="font-medium text-destructive">Download failed</Text>
            {item.fetchError ? <Text className="text-sm text-muted-foreground">{item.fetchError}</Text> : null}
            <Button
              variant="outline"
              disabled={refetch.isPending}
              onPress={() => {
                refetch.mutate(undefined, { onError: fail });
              }}
            >
              <Icon as={RefreshCw} />
              <Text>Try again</Text>
            </Button>
          </View>
        )}
        {item.availability === "gone" && (
          <Text className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            The original post seems to have been removed. Your archived copy is kept.
          </Text>
        )}

        <View className="flex-row items-center gap-1">
          <Input
            clearable
            containerClassName="flex-1 w-auto"
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            onBlur={() => {
              const next = title.trim() === "" ? null : title.trim();
              if (next !== item.title) patch({ title: next });
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            onPress={() => {
              patch({ favorite: !item.favorite });
            }}
          >
            <Icon as={Heart} className={item.favorite ? "fill-primary text-primary" : ""} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onPress={() => {
              void Linking.openURL(item.sourceUrl);
            }}
          >
            <Icon as={ExternalLink} />
          </Button>
        </View>

        {item.caption ? <Text className="text-sm text-muted-foreground">{item.caption}</Text> : null}
        {item.sharedComment ? <SharedCommentCard comment={item.sharedComment} /> : null}

        <View className="flex-row gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable
              key={n}
              hitSlop={6}
              onPress={() => {
                patch({ rating: item.rating === n ? null : n });
              }}
            >
              <Icon as={Star} size={26} className={(item.rating ?? 0) >= n ? "fill-primary text-primary" : "text-muted-foreground"} />
            </Pressable>
          ))}
        </View>

        <Section title="What is it for?">
          <View className="flex-row flex-wrap gap-2">
            {WORKFLOW_ORDER.map((w) => (
              <Chip
                key={w}
                label={WORKFLOW_META[w].label}
                active={item.workflow === w}
                onPress={() => {
                  patch({ workflow: w });
                }}
              />
            ))}
          </View>
          <Text className="text-xs text-muted-foreground">{WORKFLOW_META[item.workflow].hint}</Text>
        </Section>

        {hasSuggestions && (
          <Section title="Suggestions">
            <View className="flex-row flex-wrap gap-2">
              {item.suggestions.folders.map((s) => (
                <Chip
                  key={s.id}
                  label={`📁 ${s.name} ${Math.round(s.confidence * 100)}%`}
                  onPress={() => {
                    accept.mutate({ folderIds: [s.id], tagIds: [] }, { onError: fail });
                  }}
                />
              ))}
              {item.suggestions.tags.map((s) => (
                <Chip
                  key={s.id}
                  label={`# ${s.name} ${Math.round(s.confidence * 100)}%`}
                  onPress={() => {
                    accept.mutate({ folderIds: [], tagIds: [s.id] }, { onError: fail });
                  }}
                />
              ))}
            </View>
            <View className="flex-row gap-2">
              <Button
                size="sm"
                onPress={() => {
                  accept.mutate({}, { onError: fail });
                }}
              >
                <Text>Accept all</Text>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onPress={() => {
                  dismiss.mutate({}, { onError: fail });
                }}
              >
                <Text>Dismiss all</Text>
              </Button>
            </View>
            <Text className="text-xs text-muted-foreground">Tap a suggestion to accept it.</Text>
          </Section>
        )}

        <Section title="Folders">
          <View className="flex-row flex-wrap items-center gap-2">
            {item.folders.map((f) => (
              <Chip key={f.id} label={f.assignedBy === "auto" ? `${f.name} (auto)` : f.name} active onPress={() => { setPicking("folders"); }} />
            ))}
            <Chip label="Edit folders" onPress={() => { setPicking("folders"); }} />
          </View>
        </Section>

        <Section title="Tags">
          <View className="flex-row flex-wrap items-center gap-2">
            {item.tags.map((t) => (
              <Chip key={t.id} label={`#${t.name}`} active onPress={() => { setPicking("tags"); }} />
            ))}
            <Chip label="Edit tags" onPress={() => { setPicking("tags"); }} />
          </View>
        </Section>

        <Section title="Notes">
          <Input
            value={notes}
            onChangeText={setNotes}
            placeholder="Add notes…"
            multiline
            className="h-28 py-2"
            textAlignVertical="top"
            onBlur={() => {
              const next = notes.trim() === "" ? null : notes;
              if (next !== item.notes) patch({ notes: next });
            }}
          />
        </Section>

        {(fields.data?.length ?? 0) > 0 && (
          <Section title="Details">
            <View className="gap-3">
              {fields.data?.map((def) => (
                <FieldEditor
                  key={`${def.id}:${JSON.stringify(item.custom[def.key] ?? null)}`}
                  def={def}
                  value={item.custom[def.key]}
                  onChange={(value) => {
                    patch({ custom: { [def.key]: value } });
                  }}
                />
              ))}
            </View>
          </Section>
        )}

        {item.keywords.length > 0 && (
          <Section title="Keywords">
            <Text className="text-sm text-muted-foreground">{item.keywords.map((k) => k.keyword).join(" · ")}</Text>
          </Section>
        )}

        <View className="mt-2 flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={refetch.isPending}
            onPress={() => {
              refetch.mutate(undefined, { onError: fail });
            }}
          >
            <Icon as={RefreshCw} />
            <Text>Refetch</Text>
          </Button>
          <Button variant="outline" className="flex-1" onPress={confirmDelete}>
            <Icon as={Trash2} className="text-destructive" />
            <Text className="text-destructive">Delete</Text>
          </Button>
        </View>
        <Text className="text-center text-xs text-muted-foreground">
          Saved {new Date(item.savedAt).toLocaleDateString()} · {item.source}
        </Text>
      </View>

      {picking === "folders" && (
        <OptionPicker
          visible
          multiple
          title="Folders"
          options={folderOptions}
          selected={item.folders.map((f) => f.id)}
          onCreate={async (name) => (await createFolder.mutateAsync({ name })).id}
          onClose={() => {
            setPicking(null);
          }}
          onDone={(ids) => {
            setPicking(null);
            setFolders.mutate(ids, { onError: fail });
          }}
        />
      )}
      {picking === "tags" && (
        <OptionPicker
          visible
          multiple
          title="Tags"
          options={tagOptions}
          selected={item.tags.map((t) => t.id)}
          onCreate={async (name) => {
            const { id } = await createTag.mutateAsync({ name });
            // a tag made from an item belongs on it right away, without waiting for "Done"
            await setTags.mutateAsync([...item.tags.map((t) => t.id), id]);
            return id;
          }}
          onClose={() => {
            setPicking(null);
          }}
          onDone={(ids) => {
            setPicking(null);
            setTags.mutate(ids, { onError: fail });
          }}
        />
      )}
    </ScrollView>
    </SafeAreaView>
  );
}
