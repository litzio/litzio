import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return <CheckboxPrimitive.Root {...props} className={cn("inline-flex size-4 shrink-0 items-center justify-center rounded-sm border border-input bg-background text-primary-foreground outline-none data-checked:border-primary data-checked:bg-primary focus-visible:ring-2 focus-visible:ring-[var(--id-color-border-focus)] disabled:opacity-50", className)}>
    <CheckboxPrimitive.Indicator><Check className="size-3" /></CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>;
}
