import { alert } from "@/lib/alert";
import { ActAsBanner } from "@/components/account-chrome";
import { buildFolderTree, flattenFolderTree } from "@magpie/shared/api";
import { useRouter } from "expo-router";
import { Folder, Hash, Plus, Wand2 } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import {
  useCreateFolder,
  useCreateTag,
  useDeleteFolder,
  useDeleteTag,
  useFolders,
  useSmartFolders,
  useTags,
} from "@/lib/queries";

function SectionTitle({ children }: { children: string }) {
  return <Text className="mb-1 mt-5 px-4 text-xs font-semibold uppercase text-muted-foreground">{children}</Text>;
}

function Row({
  icon,
  label,
  count,
  depth = 0,
  onPress,
  onLongPress,
}: {
  icon: typeof Folder;
  label: string;
  count?: number;
  depth?: number;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      className="flex-row items-center gap-3 px-4 py-3 active:bg-accent"
    >
      <View className={depth === 1 ? "w-4" : depth >= 2 ? "w-8" : "w-0"} />
      <Icon as={icon} className="text-muted-foreground" />
      <Text className="flex-1">{label}</Text>
      {count !== undefined ? <Text className="text-sm text-muted-foreground">{count}</Text> : null}
    </Pressable>
  );
}

export default function FoldersScreen() {
  const router = useRouter();
  const folders = useFolders();
  const tags = useTags();
  const smart = useSmartFolders();
  const createFolder = useCreateFolder();
  const createTag = useCreateTag();
  const deleteFolder = useDeleteFolder();
  const deleteTag = useDeleteTag();
  const [name, setName] = useState("");
  const [parent, setParent] = useState<{ id: string; name: string } | null>(null);

  const tree = useMemo(() => flattenFolderTree(buildFolderTree(folders.data ?? [])), [folders.data]);


  const fail = (e: Error) => {
    alert("Failed", e.message);
  };

  const add = (kind: "folder" | "tag") => {
    const n = name.trim();
    if (!n) return;
    const done = {
      onSuccess: () => {
        setName("");
        setParent(null);
      },
      onError: fail,
    };
    if (kind === "folder") createFolder.mutate({ name: n, parentId: parent?.id ?? null }, done);
    else createTag.mutate({ name: n }, done);
  };

  const refreshing = folders.isRefetching || tags.isRefetching || smart.isRefetching;
  const refresh = () => {
    void folders.refetch();
    void tags.refetch();
    void smart.refetch();
  };

  return (
    <View className="flex-1 bg-background">
    <ActAsBanner />
    <ScrollView
      className="flex-1"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-2 px-4 pt-3">
        <Input
          clearable
          value={name}
          onChangeText={setName}
          placeholder={parent ? `New folder in ${parent.name}` : "New folder or tag name"}
        />
        <View className="flex-row gap-2">
          <Button
            className="flex-1"
            variant="secondary"
            onPress={() => {
              add("folder");
            }}
          >
            <Icon as={Plus} />
            <Text>Folder</Text>
          </Button>
          <Button
            className="flex-1"
            variant="secondary"
            onPress={() => {
              add("tag");
            }}
          >
            <Icon as={Plus} />
            <Text>Tag</Text>
          </Button>
          {parent ? (
            <Button
              variant="ghost"
              onPress={() => {
                setParent(null);
              }}
            >
              <Text>Top level</Text>
            </Button>
          ) : null}
        </View>
      </View>

      {(smart.data?.length ?? 0) > 0 && <SectionTitle>Smart folders</SectionTitle>}
      {smart.data?.map((s) => (
        <Row
          key={s.id}
          icon={Wand2}
          label={s.name}
          onPress={() => {
            router.push({ pathname: "/list", params: { smartFolderId: s.id, title: s.name } });
          }}
        />
      ))}

      <SectionTitle>Folders</SectionTitle>
      {tree.length === 0 && <Text className="px-4 py-2 text-muted-foreground">No folders yet.</Text>}
      {tree.map((f) => (
        <Row
          key={f.id}
          icon={Folder}
          label={f.name}
          count={f.itemCount}
          depth={f.depth}
          onPress={() => {
            router.push({ pathname: "/list", params: { folderId: f.id, title: f.path } });
          }}
          onLongPress={() => {
            alert(f.name, undefined, [
              {
                text: "New subfolder",
                onPress: () => {
                  setParent({ id: f.id, name: f.name });
                },
              },
              {
                text: "Delete folder",
                style: "destructive",
                onPress: () => {
                  deleteFolder.mutate(f.id, { onError: fail });
                },
              },
              { text: "Cancel", style: "cancel" },
            ]);
          }}
        />
      ))}

      <SectionTitle>Tags</SectionTitle>
      {(tags.data?.length ?? 0) === 0 && <Text className="px-4 py-2 text-muted-foreground">No tags yet.</Text>}
      {tags.data?.map((t) => (
        <Row
          key={t.id}
          icon={Hash}
          label={t.name}
          count={t.itemCount}
          onPress={() => {
            router.push({ pathname: "/list", params: { tagId: t.id, title: `#${t.name}` } });
          }}
          onLongPress={() => {
            alert(t.name, undefined, [
              {
                text: "Delete tag",
                style: "destructive",
                onPress: () => {
                  deleteTag.mutate(t.id, { onError: fail });
                },
              },
              { text: "Cancel", style: "cancel" },
            ]);
          }}
        />
      ))}
      <View className="h-12" />
    </ScrollView>
    </View>
  );
}
