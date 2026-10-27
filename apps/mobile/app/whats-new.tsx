import { ScrollView, View } from "react-native";
import { InlineMarkdown } from "@/components/inline-markdown";
import { SafeAreaView } from "@/components/styled";
import { Text } from "@/components/ui/text";
import { changelog } from "@/lib/changelog";

export default function WhatsNew() {
  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-background">
    <ScrollView className="flex-1" contentContainerClassName="gap-6 p-4 pb-12">
      {changelog.length === 0 && <Text className="text-muted-foreground">No release notes in this build.</Text>}
      {changelog.map((entry) => (
        <View key={entry.version} className="gap-2">
          <Text variant="h4">
            {entry.version}
            {entry.date ? <Text className="text-sm font-normal text-muted-foreground">{`  ${entry.date}`}</Text> : null}
          </Text>
          {entry.sections.map((section) => (
            <View key={section.title} className="gap-1">
              <Text className="text-sm font-semibold text-muted-foreground">{section.title}</Text>
              {section.items.map((line) => (
                <InlineMarkdown key={line} className="pl-2" text={`• ${line}`} />
              ))}
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
    </SafeAreaView>
  );
}
