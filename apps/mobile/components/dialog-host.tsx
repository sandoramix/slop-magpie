import { X } from "lucide-react-native";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useDialog } from "@/stores/dialog";

/** Mounted once in the root layout. Back button, tapping outside and the X all close it. */
export function DialogHost() {
  const sheet = useDialog((s) => s.sheet);
  const close = useDialog((s) => s.close);
  if (!sheet) return null;

  const cancel = sheet.buttons.find((b) => b.style === "cancel");
  const actions = sheet.buttons.filter((b) => b.style !== "cancel");
  const dismiss = () => {
    close();
    cancel?.onPress?.();
    sheet.onDismiss?.();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      {/* a Modal is its own window: it needs its own insets provider to clear the navigation bar */}
      <SafeAreaProvider>
        <Pressable className="flex-1 bg-black/50" onPress={dismiss} />
        <View className="max-h-[80%] rounded-t-2xl bg-background px-4 pt-4">
          <SafeAreaView edges={["bottom"]} className="gap-3 pb-4">
            <View className="flex-row items-start justify-between gap-3">
              <Text className="flex-1 text-lg font-semibold">{sheet.title}</Text>
              <Pressable onPress={dismiss} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" className="active:opacity-60">
                <Icon as={X} size={22} className="text-muted-foreground" />
              </Pressable>
            </View>
            {sheet.message ? <Text className="text-muted-foreground">{sheet.message}</Text> : null}
            <ScrollView contentContainerClassName="gap-2" keyboardShouldPersistTaps="handled">
              {actions.map((b, i) => (
                <Button
                  key={`${b.text ?? ""}-${String(i)}`}
                  variant={b.style === "destructive" ? "destructive" : "outline"}
                  onPress={() => {
                    close();
                    b.onPress?.();
                  }}
                >
                  <Text>{b.text}</Text>
                </Button>
              ))}
              <Button variant="ghost" onPress={dismiss}>
                <Text>{cancel?.text ?? "Cancel"}</Text>
              </Button>
            </ScrollView>
          </SafeAreaView>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}
