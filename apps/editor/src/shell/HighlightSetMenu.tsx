import { Check, Highlighter, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { i18n } from "../i18n.ts";
import { activeHighlightSet, chooseHighlightSet, folderDefaultOf, setHighlightFolderDefault, useHighlightState, type HighlightSet } from "../highlight-sets.ts";

/** Up to three of the set's colors, in word order. */
export function HighlightSetColors({ set }: { set: HighlightSet }) {
  const colors = [...new Set(set.words.map(word => word.color))].slice(0, 3);
  return colors.length ? <span className="highlight-set-colors" aria-hidden="true">
    {colors.map(color => <span key={color} className="highlight-swatch" data-highlight={color} />)}
  </span> : null;
}

/** The document's highlight set (#2020) in its tab row: the set's colors and name while one is on. */
export function HighlightSetMenu({ path, compact, onManage }: { path: string; compact: boolean; onManage(): void }) {
  useTranslation();
  const state = useHighlightState();
  const active = activeHighlightSet(path, state);
  const folderDefault = folderDefaultOf(path, state);
  const label = active
    ? i18n.t(active.source === "folder" ? "Highlights: {{name}} (folder default)" : "Highlights: {{name}}", { name: active.set.name })
    : i18n.t("Highlights: off");
  const tip = `${label} — ${i18n.t("Remembered here; never saved in the document.")}`;
  return <DropdownMenu>
    <Tooltip>
      <TooltipTrigger render={<DropdownMenuTrigger render={<Button type="button" variant="ghost" size={active ? "sm" : "icon-sm"}
        className="highlight-set-button" data-active={active ? "" : undefined} data-testid="highlight-set-button" aria-label={label} />} />}>
        <Highlighter aria-hidden="true" />
        {active ? <HighlightSetColors set={active.set} /> : null}
        {active && !compact ? <span className="highlight-set-name" aria-hidden="true">{active.set.name}</span> : null}
      </TooltipTrigger>
      <TooltipContent side="bottom">{tip}</TooltipContent>
    </Tooltip>
    <DropdownMenuContent align="end" className="highlight-set-menu" data-testid="highlight-set-menu">
      {state.sets.map(set => <DropdownMenuItem key={set.id} role="menuitemradio" aria-checked={active?.set.id === set.id}
        onClick={() => chooseHighlightSet(path, set.id)}>
        <span className="highlight-set-menu-mark">{active?.set.id === set.id ? <Check aria-hidden="true" /> : null}</span>
        <span className="highlight-set-menu-name">{set.name}</span>
        {folderDefault === set.id ? <span className="highlight-set-menu-hint">{i18n.t("Folder default")}</span> : null}
        <HighlightSetColors set={set} />
      </DropdownMenuItem>)}
      <DropdownMenuItem role="menuitemradio" aria-checked={!active} onClick={() => chooseHighlightSet(path, "off")}>
        <span className="highlight-set-menu-mark">{!active ? <Check aria-hidden="true" /> : null}</span>
        <span className="highlight-set-menu-name">{i18n.t("Off")}</span>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem role="menuitemcheckbox" aria-checked={Boolean(active && folderDefault === active.set.id)} disabled={!active}
        onClick={() => { if (active) setHighlightFolderDefault(path, folderDefault === active.set.id ? null : active.set.id); }}>
        <span className="highlight-set-menu-mark">{active && folderDefault === active.set.id ? <Check aria-hidden="true" /> : null}</span>
        <span className="highlight-set-menu-name">{i18n.t("Default for this folder")}</span>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onManage}>
        <span className="highlight-set-menu-mark"><Settings2 aria-hidden="true" /></span>
        <span className="highlight-set-menu-name">{i18n.t("Manage sets…")}</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
