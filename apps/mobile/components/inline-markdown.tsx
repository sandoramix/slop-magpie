import { Linking } from "react-native";
import { Text } from "@/components/ui/text";
import { parseInline } from "@/lib/inline-markdown";
import { cn } from "@/lib/utils";

/** One line of Markdown (bold, code, italic, links) shown as formatted text. */
export function InlineMarkdown({ text, className }: { text: string; className?: string | undefined }) {
  return (
    <Text {...(className ? { className } : {})}>
      {parseInline(text).map((s, i) => (
        <Text
          key={i}
          className={cn(
            s.bold && "font-bold",
            s.italic && "italic",
            s.code && "bg-muted font-mono text-sm",
            s.href && "text-primary underline",
          )}
          {...(s.href
            ? {
                onPress: () => {
                  void Linking.openURL(s.href ?? "");
                },
              }
            : {})}
        >
          {s.text}
        </Text>
      ))}
    </Text>
  );
}
