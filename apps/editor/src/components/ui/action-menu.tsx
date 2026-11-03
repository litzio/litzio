import { useId, useRef } from "react";
import { MoreHorizontal } from "lucide-react";
import type { PluginMenuProps } from "@litzio/plugin-api/ui";
import { Button } from "./button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./dropdown-menu.tsx";

/** The caller supplies actions; Base UI owns dismissal, navigation and focus return. */
export function ActionMenu({ label, items }: PluginMenuProps) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null);
  return <DropdownMenu>
    <DropdownMenuTrigger ref={trigger} render={<Button variant="ghost" size="icon-sm" aria-label={label} />}><MoreHorizontal aria-hidden="true" /></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="max-w-[var(--layout-settings-control-width)]">
      {items.map(item => <DropdownMenuItem key={item.id} disabled={item.disabled} onClick={() => item.run(trigger.current)}
        aria-label={item.label} aria-describedby={item.description ? `${id}-${item.id}` : undefined}
        className={item.danger ? "text-destructive" : undefined}>
        <div className="min-w-0 whitespace-normal [overflow-wrap:anywhere]"><span>{item.label}</span>{item.description ? <p id={`${id}-${item.id}`} className="m-0 text-xs text-muted-foreground">{item.description}</p> : null}</div>
      </DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}
