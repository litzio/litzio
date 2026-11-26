import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button.tsx";
import { ColorSwatches } from "@/components/ui/color-swatches.tsx";
import { DangerConfirmation } from "@/components/ui/danger-confirmation.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Popover, PopoverContent } from "@/components/ui/popover.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { i18n } from "../i18n.ts";
import {
  createHighlightSet, deleteHighlightSet, HIGHLIGHT_COLOR_LABELS, HIGHLIGHT_COLORS, HIGHLIGHT_NAME_MAX, HIGHLIGHT_WORD_MAX, highlightWordIn,
  highlightWordText, renameHighlightSet, setHighlightWord, useHighlightSaveProblem, useHighlightState, type HighlightColor, type HighlightSet,
} from "../highlight-sets.ts";

const colorLabel = (color: HighlightColor) => i18n.t(HIGHLIGHT_COLOR_LABELS[color]);
const colorValue = (color: HighlightColor) => `var(--id-color-highlight-${color})`;

/** The palette as radios; changing a color applies it at once. */
export function HighlightColorChoice({ value, onChange, testId }: { value: HighlightColor | null; onChange(color: HighlightColor): void; testId?: string }) {
  return <ColorSwatches colors={HIGHLIGHT_COLORS} value={value} onChange={onChange} label={i18n.t("Highlight color")}
    colorLabel={colorLabel} colorValue={colorValue} testId={testId} />;
}

function WordChip({ set, text, color }: { set: HighlightSet; text: string; color: HighlightColor }) {
  return <li className="highlight-word-chip" data-testid="highlight-word">
    <Popover>
      <Tooltip>
        <TooltipTrigger render={<PopoverPrimitive.Trigger render={<Button type="button" variant="ghost" size="icon-xs"
          aria-label={i18n.t("Color of {{word}}: {{color}}", { word: text, color: colorLabel(color) })} />} />}>
          <span className="highlight-swatch" data-highlight={color} aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>{i18n.t("Change color")}</TooltipContent>
      </Tooltip>
      <PopoverContent className="highlight-color-popover" align="start">
        <HighlightColorChoice value={color} onChange={next => setHighlightWord(set.id, text, next)} />
      </PopoverContent>
    </Popover>
    <span className="highlight-word-text" data-highlight={color}>{text}</span>
    <Button type="button" variant="ghost" size="icon-xs" aria-label={i18n.t("Remove {{word}}", { word: text })} title={i18n.t("Remove {{word}}", { word: text })}
      onClick={() => setHighlightWord(set.id, text, null)}><X aria-hidden="true" /></Button>
  </li>;
}

function SetSection({ set }: { set: HighlightSet }) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [word, setWord] = useState("");
  const [color, setColor] = useState<HighlightColor>("blue");
  const deleteButton = useRef<HTMLButtonElement>(null);
  const renameButton = useRef<HTMLButtonElement>(null);
  const wordText = highlightWordText(word);
  const existing = wordText ? highlightWordIn(set, wordText) : undefined;
  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!wordText) return;
    setHighlightWord(set.id, wordText, color);
    setWord("");
  };
  return <section className="highlight-set-section" aria-label={set.name} data-testid="highlight-set-section">
    <header className="highlight-set-section-header">
      {renaming === null ? <>
        <h3 className="type-item-name highlight-set-section-name">{set.name}</h3>
        <Button ref={renameButton} type="button" variant="ghost" size="sm" onClick={() => setRenaming(set.name)}><Pencil aria-hidden="true" />{i18n.t("Rename")}</Button>
        <Button ref={deleteButton} type="button" variant="ghost" size="sm" onClick={() => setDeleting(true)}><Trash2 aria-hidden="true" />{i18n.t("Delete set")}</Button>
      </> : <form className="highlight-set-form" onSubmit={event => {
        event.preventDefault();
        if (!renaming.trim()) return;
        renameHighlightSet(set.id, renaming);
        setRenaming(null);
        requestAnimationFrame(() => renameButton.current?.focus());
      }}>
        <Input autoFocus aria-label={i18n.t("Set name")} value={renaming} maxLength={HIGHLIGHT_NAME_MAX} onChange={event => setRenaming(event.target.value)}
          onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); setRenaming(null); } }} />
        <Button type="submit" size="sm" disabled={!renaming.trim()}>{i18n.t("Done")}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)}>{i18n.t("Cancel")}</Button>
      </form>}
    </header>
    {set.words.length ? <ul className="highlight-word-list" aria-label={i18n.t("Words in {{name}}", { name: set.name })}>
      {set.words.map(item => <WordChip key={item.text} set={set} text={item.text} color={item.color} />)}
    </ul> : <p className="type-helper">{i18n.t("No words yet.")}</p>}
    <form className="highlight-set-form" onSubmit={add}>
      <Input aria-label={i18n.t("Word or phrase")} placeholder={i18n.t("Word or phrase")} value={word} maxLength={HIGHLIGHT_WORD_MAX}
        onChange={event => setWord(event.target.value)} title={i18n.t("English words match whole words in any case; other text matches exactly.")} />
      <HighlightColorChoice value={color} onChange={setColor} />
      <Button type="submit" size="sm" variant="outline" disabled={!wordText}>
        <Plus aria-hidden="true" />{existing ? i18n.t("Change color") : i18n.t("Add")}
      </Button>
    </form>
    {deleting ? <DangerConfirmation title={i18n.t("Delete the highlight set “{{name}}”?", { name: set.name })}
      description={i18n.t("Its words and the documents and folders using it stop showing these highlights. Documents are not changed.")}
      action={i18n.t("Delete set")} pending={false} error="" returnFocus={deleteButton}
      onConfirm={() => { deleteHighlightSet(set.id); setDeleting(false); }} onClose={() => setDeleting(false)} /> : null}
  </section>;
}

/** Settings → Highlight sets: this device's named word lists (#2020). */
export function HighlightSetSettings() {
  useTranslation();
  const state = useHighlightState();
  const saveProblem = useHighlightSaveProblem();
  const [name, setName] = useState("");
  return <div className="highlight-set-settings" data-testid="highlight-set-settings">
    <p className="type-helper">{i18n.t("Choose a set for a document from the highlighter in its tab row. Remembered here; never saved in the document.")}</p>
    {state.sets.map(set => <SetSection key={set.id} set={set} />)}
    <form className="highlight-set-form highlight-set-new" onSubmit={event => {
      event.preventDefault();
      if (createHighlightSet(name)) setName("");
    }}>
      <Input aria-label={i18n.t("New set name")} placeholder={i18n.t("New set name")} value={name} maxLength={HIGHLIGHT_NAME_MAX}
        onChange={event => setName(event.target.value)} />
      <Button type="submit" size="sm" variant="outline" disabled={!name.trim()}><Plus aria-hidden="true" />{i18n.t("New set")}</Button>
    </form>
    {saveProblem ? <p role="alert">{i18n.t("Highlight sets could not be saved. These changes apply until you close this page.")}</p> : null}
  </div>;
}
