import type { ComponentProps } from "react";
import { Button } from "./button.tsx";
import { cn } from "@/lib/utils";

type Choice<T extends string> = { value: T; label: string; disabled?: boolean; testId?: string };
type ChoiceGroupProps<T extends string> = Omit<ComponentProps<"div">, "onChange" | "children"> & {
  options: readonly Choice<T>[];
  value: T;
  onValueChange(value: T): void;
  disabled?: boolean;
};

/** Required single choice. Keep the existing button group's Tab order and native
 * Enter/Space activation; this is not a tablist or a formatting toolbar. */
export function ChoiceGroup<T extends string>({ options, value, onValueChange, disabled, className, ...props }: ChoiceGroupProps<T>) {
  return <div {...props} role="group" className={cn("view-toggle", className)}>
    {options.map(option => <Button key={option.value} type="button" size="sm" variant="ghost"
      className="view-toggle-option" aria-pressed={value === option.value} disabled={disabled || option.disabled}
      data-testid={option.testId} data-segment-label={option.label}
      onClick={() => onValueChange(option.value)}>
      <span className="view-toggle-label">{option.label}</span>
    </Button>)}
  </div>;
}
