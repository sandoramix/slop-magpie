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
      className={cn("rounded-full border px-3 py-1.5", active ? "border-primary bg-primary" : "border-border bg-background")}
    >
      <Text className={cn("text-sm", active && "text-primary-foreground")}>{label}</Text>
    </Pressable>
  );
}
