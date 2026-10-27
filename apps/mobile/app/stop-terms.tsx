import { useState } from "react";
import { ActivityIndicator, FlatList, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { alert } from "@/lib/alert";
import { useAddStopTerm, useRemoveStopTerm, useStopTerms } from "@/lib/organize-queries";

/** Words that should never become keywords of your items. Adding one also clears it from what is already extracted. */
export default function StopTermsScreen() {
  const terms = useStopTerms();
  const add = useAddStopTerm();
  const remove = useRemoveStopTerm();
  const [text, setText] = useState("");
  const fail = (e: Error) => {
    alert("Failed", e.message);
  };

  const submit = () => {
    const term = text.trim();
    if (term.length < 2) return;
    add.mutate(term, { onSuccess: () => { setText(""); }, onError: fail });
  };

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={terms.data ?? []}
        keyExtractor={(t) => t}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View className="gap-2 p-4">
            <Text className="text-sm text-muted-foreground">
              Generic words like "recipe" or "reels" make poor keywords. Add them here and they are dropped from every item, now and for new saves. Keywords you typed yourself stay.
            </Text>
            <View className="flex-row gap-2">
              <Input className="flex-1" value={text} onChangeText={setText} placeholder="Word or short phrase" autoCapitalize="none" autoCorrect={false} onSubmitEditing={submit} />
              <Button disabled={add.isPending || text.trim().length < 2} onPress={submit}>
                <Text>Add</Text>
              </Button>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
            <Text className="flex-1">{item}</Text>
            <Button size="sm" variant="ghost" disabled={remove.isPending} onPress={() => { remove.mutate(item, { onError: fail }); }}>
              <Text>Remove</Text>
            </Button>
          </View>
        )}
        ListEmptyComponent={
          terms.isPending ? <ActivityIndicator className="py-12" /> : <Text className="px-4 py-8 text-center text-muted-foreground">No ignored words.</Text>
        }
      />
    </View>
  );
}
