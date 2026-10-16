import { useColorScheme } from "nativewind";

// JS-side mirror of the CSS variables in global.css, for props that can't take className
// (tab bar tint, spinners, placeholder colors).
const palette = {
  light: { background: "#ffffff", foreground: "#09090b", muted: "#71717a", border: "#e4e4e7", primary: "#7c3aed", card: "#ffffff" },
  dark: { background: "#09090b", foreground: "#fafafa", muted: "#a1a1aa", border: "#27272a", primary: "#a78bfa", card: "#121214" },
} as const;

export type Colors = (typeof palette)["light"] | (typeof palette)["dark"];

export function useColors(): Colors {
  const { colorScheme } = useColorScheme();
  return palette[colorScheme ?? "light"];
}
