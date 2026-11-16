import type { ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";

/** One entry of a document object's tool row. A narrow block shows the icon; the name stays its tooltip. */
export function ObjectTool({ icon: Icon, label, name, ...props }: Omit<ComponentProps<typeof Button>, "children"> & {
  icon: LucideIcon; label: string;
  /** Accessible name when the visible label alone does not identify the object. */
  name?: string;
}) {
  // A pointer press must not move focus into the block: the engine would read it as a caret in the
  // caption, and closing the form would return there instead of after the object.
  return <Button type="button" size="sm" variant="outline" title={label} aria-label={name ?? label}
    onMouseDown={event => event.preventDefault()} {...props}>
    <Icon className="object-tool-icon" size={16} aria-hidden="true" />
    <span className="object-tool-label">{label}</span>
  </Button>;
}
