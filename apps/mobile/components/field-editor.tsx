import { formatFieldValue, type FieldDef } from "@magpie/shared/api";
import { useState } from "react";
import { View } from "react-native";
import { Chip } from "@/components/chip";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

type Props = {
  def: FieldDef;
  value: unknown;
  /** `null` clears the value. */
  onChange: (value: unknown) => void;
};

/** One custom field. Text-like types save on blur, choice types save on tap. */
export function FieldEditor({ def, value, onChange }: Props) {
  const options = def.options ?? [];
  const shown = def.type === "duration" && typeof value === "number" ? String(Math.round(value / 60)) : formatFieldValue(def.type, value);
  const [draft, setDraft] = useState(def.type === "boolean" ? "" : shown);

  const commit = () => {
    const text = draft.trim();
    if (text === shown) return;
    if (text === "") {
      onChange(null);
      return;
    }
    if (def.type === "number") {
      const n = Number(text);
      if (Number.isFinite(n)) onChange(n);
      return;
    }
    if (def.type === "duration") {
      const m = Number(text);
      if (Number.isFinite(m) && m >= 0) onChange(Math.round(m * 60));
      return;
    }
    onChange(text);
  };

  return (
    <View className="gap-1">
      <Text className="text-sm text-muted-foreground">
        {def.label}
        {def.type === "duration" ? " (minutes)" : def.type === "date" ? " (YYYY-MM-DD)" : ""}
      </Text>
      {def.type === "boolean" ? (
        <View className="flex-row gap-2">
          <Chip
            label="Yes"
            active={value === true}
            onPress={() => {
              onChange(value === true ? null : true);
            }}
          />
          <Chip
            label="No"
            active={value === false}
            onPress={() => {
              onChange(value === false ? null : false);
            }}
          />
        </View>
      ) : def.type === "select" ? (
        <View className="flex-row flex-wrap gap-2">
          {options.map((o) => (
            <Chip
              key={o}
              label={o}
              active={value === o}
              onPress={() => {
                onChange(value === o ? null : o);
              }}
            />
          ))}
        </View>
      ) : def.type === "multiselect" ? (
        <View className="flex-row flex-wrap gap-2">
          {options.map((o) => {
            const current = Array.isArray(value) ? (value as unknown[]).map(String) : [];
            const on = current.includes(o);
            return (
              <Chip
                key={o}
                label={o}
                active={on}
                onPress={() => {
                  const next = on ? current.filter((v) => v !== o) : [...current, o];
                  onChange(next.length > 0 ? next : null);
                }}
              />
            );
          })}
        </View>
      ) : (
        <Input
          clearable
          value={draft}
          onChangeText={setDraft}
          onBlur={commit}
          autoCapitalize="none"
          keyboardType={def.type === "number" || def.type === "duration" ? "numeric" : def.type === "url" ? "url" : "default"}
        />
      )}
    </View>
  );
}
