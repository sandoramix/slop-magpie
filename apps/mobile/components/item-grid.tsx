import type { ItemSummary } from "@magpie/shared/api";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { AlertTriangle, CheckCircle2, Heart, Images, Link2, Play, Sparkles, type LucideIcon } from "lucide-react-native";
import { ActivityIndicator, Pressable, RefreshControl, View } from "react-native";
import { Image } from "@/components/styled";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { aspectClass } from "@/lib/media";
import { useColors } from "@/lib/theme";
import { cn } from "@/lib/utils";

type CardProps = {
  item: ItemSummary;
  selected: boolean;
  selecting: boolean;
  onPress: () => void;
  onLongPress: () => void;
};

function Badge({ icon, label }: { icon?: LucideIcon; label?: string }) {
  return (
    <View className="flex-row items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5">
      {icon ? <Icon as={icon} size={11} className="text-white" /> : null}
      {label ? <Text className="text-[10px] text-white">{label}</Text> : null}
    </View>
  );
}

function ItemCard({ item, selected, selecting, onPress, onLongPress }: CardProps) {
  const colors = useColors();
  const busy = item.fetchStatus === "pending" || item.fetchStatus === "fetching";
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} className="p-1">
      <View className={cn("overflow-hidden rounded-lg border-2 border-transparent bg-muted", selected && "border-primary")}>
        {item.thumbUrl ? (
          <Image source={{ uri: item.thumbUrl }} className={cn("w-full", aspectClass(item.aspectRatio))} contentFit="cover" />
        ) : (
          <View className={cn("w-full items-center justify-center p-3", aspectClass(item.aspectRatio ?? 1))}>
            {busy ? (
              <ActivityIndicator color={colors.muted} />
            ) : (
              <>
                <Icon as={item.fetchStatus === "failed" ? AlertTriangle : Link2} className="text-muted-foreground" size={24} />
                <Text className="mt-2 text-center text-xs text-muted-foreground" numberOfLines={3}>
                  {item.title ?? item.source}
                </Text>
              </>
            )}
          </View>
        )}
        <View className="absolute left-1.5 top-1.5 flex-row gap-1">
          {item.kind === "video" && <Badge icon={Play} />}
          {item.kind === "gallery" && <Badge icon={Images} label={String(item.mediaCount)} />}
          {item.suggestionCount > 0 && <Badge icon={Sparkles} />}
        </View>
        <View className="absolute right-1.5 top-1.5 flex-row gap-1">
          {item.favorite && <Badge icon={Heart} />}
          {item.fetchStatus === "failed" && <Badge icon={AlertTriangle} />}
          {item.availability === "gone" && <Badge label="gone" />}
        </View>
        {selecting && (
          <View className="absolute bottom-1.5 right-1.5 rounded-full bg-background">
            <Icon as={CheckCircle2} size={22} className={selected ? "text-primary" : "text-muted-foreground"} />
          </View>
        )}
      </View>
      {item.title ? (
        <Text className="mt-1 px-0.5 text-xs text-muted-foreground" numberOfLines={2}>
          {item.title}
        </Text>
      ) : null}
    </Pressable>
  );
}

type GridProps = {
  items: ItemSummary[];
  columns: number;
  selection: ReadonlySet<string>;
  onSelectionChange: (next: Set<string>) => void;
  onEndReached?: () => void;
  refreshing: boolean;
  onRefresh: () => void;
  loadingMore?: boolean;
  empty: string;
  header?: React.ReactElement | null;
};

export function ItemGrid({
  items,
  columns,
  selection,
  onSelectionChange,
  onEndReached,
  refreshing,
  onRefresh,
  loadingMore,
  empty,
  header,
}: GridProps) {
  const router = useRouter();
  const selecting = selection.size > 0;

  const toggle = (id: string) => {
    const next = new Set(selection);
    if (!next.delete(id)) next.add(id);
    onSelectionChange(next);
  };

  return (
    <FlashList
      key={columns}
      data={items}
      masonry
      numColumns={columns}
      keyExtractor={(i) => i.id}
      ListHeaderComponent={header ?? null}
      renderItem={({ item }) => (
        <ItemCard
          item={item}
          selected={selection.has(item.id)}
          selecting={selecting}
          onPress={() => {
            if (selecting) toggle(item.id);
            else router.push({ pathname: "/item/[id]", params: { id: item.id } });
          }}
          onLongPress={() => {
            toggle(item.id);
          }}
        />
      )}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.8}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerClassName="px-1.5 pb-24"
      ListEmptyComponent={
        <View className="items-center px-8 py-24">
          <Text className="text-center text-muted-foreground">{empty}</Text>
        </View>
      }
      ListFooterComponent={loadingMore ? <ActivityIndicator className="py-6" /> : null}
    />
  );
}
