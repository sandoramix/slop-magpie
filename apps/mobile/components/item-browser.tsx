import { buildFolderTree, flattenFolderTree } from "@magpie/shared/api";
import { Folder, Heart, RefreshCw, Sparkles, Tag, Trash2, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Alert, View } from "react-native";
import { ItemGrid } from "@/components/item-grid";
import { OptionPicker } from "@/components/option-picker";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ApiError } from "@/lib/api";
import { useBulk, useFolders, useItems, useTags, type ItemsQuery } from "@/lib/queries";
import { useSettings } from "@/stores/settings";

type Props = {
  query: ItemsQuery;
  empty: string;
  header?: React.ReactElement | null;
};

type Picking = "folder" | "tag" | null;

/** Grid + pull to refresh + paging + multi-select with a bulk action bar. */
export function ItemBrowser({ query, empty, header }: Props) {
  const columns = useSettings((s) => s.columns);
  const items = useItems(query);
  const folders = useFolders();
  const tags = useTags();
  const bulk = useBulk();
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState<Picking>(null);

  const flat = useMemo(() => items.data?.pages.flatMap((p) => p.items) ?? [], [items.data]);
  const folderOptions = useMemo(
    () => flattenFolderTree(buildFolderTree(folders.data ?? [])).map((f) => ({ id: f.id, label: f.name, depth: f.depth })),
    [folders.data],
  );
  const tagOptions = useMemo(() => (tags.data ?? []).map((t) => ({ id: t.id, label: t.name })), [tags.data]);

  const ids = [...selection];
  const run = (op: Parameters<typeof bulk.mutate>[0]["op"]) => {
    bulk.mutate(
      { ids, op },
      {
        onSuccess: () => {
          setSelection(new Set());
        },
        onError: (e) => {
          Alert.alert("Failed", e.message);
        },
      },
    );
  };

  const confirmDelete = () => {
    Alert.alert("Delete items?", `${selection.size} item(s) and their files will be removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          run({ op: "delete" });
        },
      },
    ]);
  };

  if (items.isError && flat.length === 0) {
    const e = items.error;
    return (
      <View className="flex-1 items-center justify-center gap-3 p-8">
        <Text className="text-center text-muted-foreground">{e instanceof ApiError ? e.message : "Something went wrong"}</Text>
        <Button
          variant="outline"
          onPress={() => {
            void items.refetch();
          }}
        >
          <Text>Retry</Text>
        </Button>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <ItemGrid
        items={flat}
        columns={columns}
        selection={selection}
        onSelectionChange={setSelection}
        refreshing={items.isRefetching && !items.isFetchingNextPage}
        onRefresh={() => {
          void items.refetch();
        }}
        onEndReached={() => {
          if (items.hasNextPage && !items.isFetchingNextPage) void items.fetchNextPage();
        }}
        loadingMore={items.isFetchingNextPage || items.isLoading}
        empty={items.isLoading ? "Loading…" : empty}
        header={header ?? null}
      />
      {selection.size > 0 && (
        <View className="absolute inset-x-0 bottom-0 flex-row items-center gap-1 border-t border-border bg-card px-2 py-2">
          <Button
            variant="ghost"
            size="icon"
            onPress={() => {
              setSelection(new Set());
            }}
          >
            <Icon as={X} />
          </Button>
          <Text className="mr-auto text-sm font-medium">{selection.size}</Text>
          <Button variant="ghost" size="icon" onPress={() => { run({ op: "setFavorite", favorite: true }); }}>
            <Icon as={Heart} />
          </Button>
          <Button variant="ghost" size="icon" onPress={() => { setPicking("folder"); }}>
            <Icon as={Folder} />
          </Button>
          <Button variant="ghost" size="icon" onPress={() => { setPicking("tag"); }}>
            <Icon as={Tag} />
          </Button>
          <Button variant="ghost" size="icon" onPress={() => { run({ op: "acceptSuggestions" }); }}>
            <Icon as={Sparkles} />
          </Button>
          <Button variant="ghost" size="icon" onPress={() => { run({ op: "refetch" }); }}>
            <Icon as={RefreshCw} />
          </Button>
          <Button variant="ghost" size="icon" onPress={confirmDelete}>
            <Icon as={Trash2} className="text-destructive" />
          </Button>
        </View>
      )}
      {picking === "folder" && (
        <OptionPicker
          visible
          multiple={false}
          title="Add to folder"
          options={folderOptions}
          onClose={() => {
            setPicking(null);
          }}
          onDone={([folderId]) => {
            setPicking(null);
            if (folderId) run({ op: "addFolder", folderId });
          }}
        />
      )}
      {picking === "tag" && (
        <OptionPicker
          visible
          multiple={false}
          title="Add tag"
          options={tagOptions}
          onClose={() => {
            setPicking(null);
          }}
          onDone={([tagId]) => {
            setPicking(null);
            if (tagId) run({ op: "addTag", tagId });
          }}
        />
      )}
    </View>
  );
}
