import type { LucideIcon, LucideProps } from "lucide-react-native";
import { cssInterop } from "nativewind";
import { cn } from "@/lib/utils";

type IconProps = LucideProps & { as: LucideIcon };

function IconImpl({ as: IconComponent, ...props }: IconProps) {
  return <IconComponent {...props} />;
}

cssInterop(IconImpl, {
  className: { target: "style", nativeStyleToProp: { color: true, opacity: true } },
});

/** lucide icon colored through `text-*` classes. */
export function Icon({ as: IconComponent, className, size = 18, ...props }: IconProps) {
  return <IconImpl as={IconComponent} className={cn("text-foreground", className)} size={size} {...props} />;
}
