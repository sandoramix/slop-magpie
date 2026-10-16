import { Check } from "lucide-react-native";
import { useState } from "react";
import { FlatList, Modal, Pressable, View } from "react-native";
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

/** Bottom-sheet list used for folders and tags, single or multi select. Mount it only while open. */
export function OptionPicker({ visible, title, options, selected, multiple, onCreate, onClose, onDone }: Props) {
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

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/50" onPress={onClose} />
      <View className="max-h-[75%] rounded-t-2xl bg-background p-4">
        <Text className="mb-3 text-lg font-semibold">{title}</Text>
        <Input
          value={filter}
          onChangeText={setFilter}
          placeholder={onCreate ? "Search or create…" : "Search…"}
          autoCapitalize="none"
        />
        <FlatList
          className="mt-2"
          data={shown}
          keyExtractor={(o) => o.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text className="py-6 text-center text-muted-foreground">Nothing here yet</Text>}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                choose(item.id);
              }}
              className="flex-row items-center justify-between py-3 active:opacity-60"
            >
              <Text className={picked.has(item.id) ? "font-semibold" : ""}>
                {"    ".repeat(needle ? 0 : (item.depth ?? 0))}
                {item.label}
              </Text>
              {multiple && picked.has(item.id) ? <Icon as={Check} className="text-primary" /> : null}
            </Pressable>
          )}
        />
        {canCreate ? (
          <Button variant="outline" className="mt-2" disabled={creating} onPress={() => void create()}>
            <Text>Create "{filter.trim()}"</Text>
          </Button>
        ) : null}
        {multiple ? (
          <Button
            className="mt-2"
            onPress={() => {
              onDone([...picked]);
            }}
          >
            <Text>Done</Text>
          </Button>
        ) : null}
      </View>
    </Modal>
  );
}
