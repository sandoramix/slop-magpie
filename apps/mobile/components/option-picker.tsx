import { Check, Plus, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { FlatList, Keyboard, Modal, Pressable, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

export type PickerOption = { id: string; label: string; depth?: number };

type Props = {
  visible: boolean;
  title: string;
  options: PickerOption[];
  /** Initial selection (multi mode). */
  selected?: readonly string[];
  multiple: boolean;
  /** Offered when the typed text matches no option; returns the new option's id. */
  onCreate?: (name: string) => Promise<string | undefined>;
  onClose: () => void;
  onDone: (ids: string[]) => void;
};

/** Height the on-screen keyboard covers; a Modal window is not resized for it, so the sheet lifts itself. */
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      setHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      setHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

/** Bottom-sheet list used for folders and tags, single or multi select. Mount it only while open. */
export function OptionPicker(props: Props) {
  return (
    <Modal visible={props.visible} animationType="slide" transparent statusBarTranslucent onRequestClose={props.onClose}>
      {/* a Modal is its own window: it needs its own insets provider to clear the navigation bar */}
      <SafeAreaProvider>
        <Sheet {...props} />
      </SafeAreaProvider>
    </Modal>
  );
}

function Sheet({ title, options, selected, multiple, onCreate, onClose, onDone }: Props) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const [picked, setPicked] = useState<Set<string>>(new Set(selected));
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);

  const needle = filter.trim().toLowerCase();
  const shown = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  const canCreate = onCreate !== undefined && needle !== "" && !options.some((o) => o.label.toLowerCase() === needle);

  const choose = (id: string) => {
    if (!multiple) {
      onDone([id]);
      return;
    }
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };

  const create = async () => {
    if (!onCreate) return;
    setCreating(true);
    try {
      const id = await onCreate(filter.trim());
      if (id) {
        setFilter("");
        choose(id);
      }
    } finally {
      setCreating(false);
    }
  };

  const typing = keyboard > 0;
  // the keyboard already covers the navigation bar, so the inset only applies without it
  const bottom = typing ? 0 : insets.bottom;

  return (
    <View className="flex-1" style={{ paddingBottom: keyboard }}>
      {/* a thin strip stays tappable above the sheet while typing; otherwise 20% */}
      <Pressable className={typing ? "h-10" : "flex-1"} onPress={onClose} accessibilityLabel="Close" />
      <View className={typing ? "flex-1" : "flex-[4]"}>
        <View className="flex-1 rounded-t-2xl border-t border-border bg-background">
          <View className="items-center pt-2">
            <View className="h-1 w-10 rounded-full bg-muted-foreground/30" />
          </View>
          <View className="flex-row items-center justify-between px-4 pb-2 pt-2">
            <Text className="text-lg font-semibold">{title}</Text>
            <View className="flex-row items-center gap-3">
              {multiple && picked.size > 0 ? (
                <Pressable
                  onPress={() => {
                    setPicked(new Set());
                  }}
                  hitSlop={8}
                  className="active:opacity-60"
                >
                  <Text className="text-sm text-muted-foreground">Clear {picked.size}</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" className="active:opacity-60">
                <Icon as={X} size={22} className="text-muted-foreground" />
              </Pressable>
            </View>
          </View>
          <View className="px-4 pb-2">
            <Input
              clearable
              value={filter}
              onChangeText={setFilter}
              placeholder={onCreate ? "Search or create…" : "Search…"}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <FlatList
            className="flex-1"
            contentContainerClassName="px-4 pb-2"
            data={shown}
            keyExtractor={(o) => o.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ListEmptyComponent={
              <Text className="py-6 text-center text-muted-foreground">
                {needle ? (canCreate ? "No match. Create it below." : "No match") : "Nothing here yet"}
              </Text>
            }
            renderItem={({ item }) => {
              const on = picked.has(item.id);
              return (
                <Pressable
                  onPress={() => {
                    choose(item.id);
                  }}
                  className="min-h-14 flex-row items-center justify-between gap-3 border-b border-border/50 active:bg-accent"
                >
                  <Text className={on ? "flex-1 font-semibold" : "flex-1"} numberOfLines={1}>
                    {"    ".repeat(needle ? 0 : (item.depth ?? 0))}
                    {item.label}
                  </Text>
                  {multiple ? (
                    <View className={on ? "h-6 w-6 items-center justify-center rounded-md bg-primary" : "h-6 w-6 rounded-md border border-input"}>
                      {on ? <Icon as={Check} size={16} className="text-primary-foreground" /> : null}
                    </View>
                  ) : null}
                </Pressable>
              );
            }}
          />
          {/* footer stays put above the keyboard so Done and Create are always reachable */}
          <View
            className={canCreate || multiple ? "gap-2 border-t border-border bg-card px-4 pt-3" : "px-4"}
            style={{ paddingBottom: canCreate || multiple ? bottom + 12 : bottom }}
          >
            {canCreate ? (
              <Button variant="outline" disabled={creating} onPress={() => void create()}>
                <Icon as={Plus} size={16} />
                <Text>Create "{filter.trim()}"</Text>
              </Button>
            ) : null}
            {multiple ? (
              <Button
                onPress={() => {
                  onDone([...picked]);
                }}
              >
                <Text>{picked.size > 0 ? `Done (${String(picked.size)})` : "Done"}</Text>
              </Button>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}
