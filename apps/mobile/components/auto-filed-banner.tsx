import { useRouter } from "expo-router";
import { Sparkles } from "lucide-react-native";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { alert } from "@/lib/alert";
import { useAutoFiled, useKeepAutoFiled, useUndoAutoFiled } from "@/lib/organize-queries";

/**
 * "N items were filed for you": the undo for automatic filing. Shown while there is something to review;
 * Keep makes the filing the person's own (and teaches the categorizer), Undo takes it back for good.
 */
export function AutoFiledBanner() {
  const router = useRouter();
  const pending = useAutoFiled();
  const keep = useKeepAutoFiled();
  const undo = useUndoAutoFiled();
  const count = pending.data?.count ?? 0;
  if (count === 0) return null;

  const fail = (e: Error) => {
    alert("Failed", e.message);
  };
  const confirmUndo = () => {
    alert("Undo automatic filing?", `${count} item(s) are taken out of the folders and tags that were picked for them. They are not filed there again.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Undo all",
        style: "destructive",
        onPress: () => {
          undo.mutate({}, { onError: fail });
        },
      },
    ]);
  };

  return (
    <View className="mx-3 mt-2 gap-2 rounded-xl border border-primary bg-card p-3">
      <View className="flex-row items-center gap-2">
        <Icon as={Sparkles} size={16} className="text-primary" />
        <Text className="flex-1 text-sm font-medium">
          {count} item{count === 1 ? " was" : "s were"} filed for you
        </Text>
      </View>
      <View className="flex-row gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onPress={() => {
            router.push("/auto-filed");
          }}
        >
          <Text>Review</Text>
        </Button>
        <Button size="sm" variant="outline" disabled={undo.isPending} onPress={confirmUndo}>
          <Text>Undo</Text>
        </Button>
        <Button
          size="sm"
          disabled={keep.isPending}
          onPress={() => {
            keep.mutate({}, { onError: fail });
          }}
        >
          <Text>Keep</Text>
        </Button>
      </View>
    </View>
  );
}
