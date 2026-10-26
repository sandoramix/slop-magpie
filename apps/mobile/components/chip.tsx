import { Pressable } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  active?: boolean;
  onPress: () => void;
};

export function Chip({ label, active = false, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={cn(
        "min-h-11 justify-center rounded-full border px-4 py-2 active:opacity-70",
        active ? "border-primary bg-primary" : "border-border bg-card",
      )}
    >
      <Text className={cn("text-base", active && "font-medium text-primary-foreground")}>{label}</Text>
    </Pressable>
  );
}
