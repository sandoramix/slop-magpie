import { buildFolderTree, flattenFolderTree, type PostDetail } from "@magpie/shared/api";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Bookmark, ExternalLink, Flag, Heart, UserX } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, View } from "react-native";
import { FeedbackCard } from "@/components/feedback-card";
import { MediaCarousel } from "@/components/media-carousel";
import { OptionPicker } from "@/components/option-picker";
import { Image, SafeAreaView } from "@/components/styled";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { alert } from "@/lib/alert";
import { useCreateFolder, useCreateTag, useFolders, useTags } from "@/lib/queries";
import { useBlock, usePost, usePostActions, useReport } from "@/lib/social-queries";

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = usePost(id);
  const router = useRouter();

  if (!query.data) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-8">
        {query.isError ? (
          <>
            <Text className="mb-3 text-center text-muted-foreground">
              {query.error.message === "Post not found" ? "This post is gone: its owner deleted it or made it private." : query.error.message}
            </Text>
            <Button
              variant="outline"
              onPress={() => {
                router.back();
              }}
            >
              <Text>Back</Text>
            </Button>
          </>
        ) : (
          <ActivityIndicator />
        )}
      </View>
    );
  }
  return <Detail post={query.data} />;
}

function Detail({ post }: { post: PostDetail }) {
  const router = useRouter();
  const actions = usePostActions(post.id);
  const report = useReport();
  const block = useBlock(post.owner.name);
  const folders = useFolders();
  const tags = useTags();
  const createFolder = useCreateFolder();
  const createTag = useCreateTag();
  const [note, setNote] = useState(post.save?.note ?? "");
  const [picking, setPicking] = useState<"folders" | "tags" | null>(null);

  const folderOptions = useMemo(
    () => flattenFolderTree(buildFolderTree(folders.data ?? [])).map((f) => ({ id: f.id, label: f.name, depth: f.depth })),
    [folders.data],
  );
  const tagOptions = useMemo(() => (tags.data ?? []).map((t) => ({ id: t.id, label: t.name })), [tags.data]);

  const fail = (e: Error) => {
    alert("Failed", e.message);
  };

  const confirmReport = () => {
    alert("Report this post?", "A moderator will look at it.", [
      { text: "Cancel", style: "cancel" },
      { text: "Spam", onPress: () => { report.mutate({ target: "item", targetId: post.id, reason: "spam" }, { onSuccess: () => { alert("Reported", "Thank you."); }, onError: fail }); } },
      { text: "Inappropriate", onPress: () => { report.mutate({ target: "item", targetId: post.id, reason: "inappropriate" }, { onSuccess: () => { alert("Reported", "Thank you."); }, onError: fail }); } },
    ]);
  };
  const confirmBlock = () => {
    alert(`Block @${post.owner.name}?`, "You will no longer see each other's posts, and any follows end.", [
      { text: "Cancel", style: "cancel" },
      { text: "Block", style: "destructive", onPress: () => { block.mutate(true, { onSuccess: () => { router.back(); }, onError: fail }); } },
    ]);
  };

  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-background">
      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ title: `@${post.owner.name}` }} />
        {post.media.length > 0 ? (
          <MediaCarousel media={post.media} fallbackRatio={post.aspectRatio} />
        ) : post.thumbUrl ? (
          <Image source={{ uri: post.thumbUrl }} className="aspect-video w-full bg-muted" contentFit="cover" />
        ) : null}

        <View className="gap-5 p-4 pb-16">
          <View className="gap-1">
            {post.title ? <Text className="text-lg font-semibold">{post.title}</Text> : null}
            <Pressable
              onPress={() => {
                router.push({ pathname: "/profile/[name]", params: { name: post.owner.name } });
              }}
            >
              <Text className="text-sm text-primary">by {post.owner.displayName ?? post.owner.name}</Text>
            </Pressable>
            {post.caption ? (
              <Text className="mt-2 text-sm text-muted-foreground" numberOfLines={12}>
                {post.caption}
              </Text>
            ) : null}
          </View>

          <View className="flex-row gap-2">
            <Button
              className="flex-1"
              variant={post.likedByMe ? "default" : "outline"}
              disabled={actions.like.isPending}
              onPress={() => {
                actions.like.mutate(!post.likedByMe, { onError: fail });
              }}
            >
              <Icon as={Heart} size={16} className={post.likedByMe ? "text-primary-foreground" : "text-foreground"} />
              <Text>{post.likeCount}</Text>
            </Button>
            <Button
              className="flex-1"
              variant={post.savedByMe ? "default" : "outline"}
              disabled={actions.save.isPending}
              onPress={() => {
                actions.save.mutate(!post.savedByMe, { onError: fail });
              }}
            >
              <Icon as={Bookmark} size={16} className={post.savedByMe ? "text-primary-foreground" : "text-foreground"} />
              <Text>{post.savedByMe ? "Saved" : "Save"}</Text>
            </Button>
            <Button
              variant="outline"
              size="icon"
              accessibilityLabel="Open original"
              onPress={() => {
                void Linking.openURL(post.canonicalUrl);
              }}
            >
              <Icon as={ExternalLink} size={16} />
            </Button>
          </View>

          {post.save && (
            <View className="gap-3 rounded-xl border border-border bg-card p-4">
              <Text className="text-xs font-semibold uppercase text-muted-foreground">Your copy</Text>
              <Input
                value={note}
                onChangeText={setNote}
                placeholder="Private note (only you see it)"
                multiline
                onBlur={() => {
                  if (note !== (post.save?.note ?? "")) actions.updateSave.mutate({ note: note.trim() === "" ? null : note }, { onError: fail });
                }}
              />
              <View className="flex-row gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onPress={() => {
                    setPicking("folders");
                  }}
                >
                  <Text>{post.save.folderIds.length ? `${post.save.folderIds.length} folder(s)` : "Add to folder"}</Text>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onPress={() => {
                    setPicking("tags");
                  }}
                >
                  <Text>{post.save.tagIds.length ? `${post.save.tagIds.length} tag(s)` : "Add tags"}</Text>
                </Button>
              </View>
            </View>
          )}

          <FeedbackCard post={post} />

          {!post.mine && (
            <View className="flex-row gap-2">
              <Button variant="ghost" size="sm" onPress={confirmReport}>
                <Icon as={Flag} size={16} />
                <Text>Report</Text>
              </Button>
              <Button variant="ghost" size="sm" onPress={confirmBlock}>
                <Icon as={UserX} size={16} />
                <Text>Block @{post.owner.name}</Text>
              </Button>
            </View>
          )}
        </View>
      </ScrollView>

      {picking === "folders" && post.save && (
        <OptionPicker
          visible
          multiple
          title="Folders"
          options={folderOptions}
          selected={post.save.folderIds}
          onCreate={async (name) => (await createFolder.mutateAsync({ name })).id}
          onClose={() => {
            setPicking(null);
          }}
          onDone={(ids) => {
            setPicking(null);
            actions.updateSave.mutate({ folderIds: ids }, { onError: fail });
          }}
        />
      )}
      {picking === "tags" && post.save && (
        <OptionPicker
          visible
          multiple
          title="Tags"
          options={tagOptions}
          selected={post.save.tagIds}
          onCreate={async (name) => (await createTag.mutateAsync({ name })).id}
          onClose={() => {
            setPicking(null);
          }}
          onDone={(ids) => {
            setPicking(null);
            actions.updateSave.mutate({ tagIds: ids }, { onError: fail });
          }}
        />
      )}
    </SafeAreaView>
  );
}
