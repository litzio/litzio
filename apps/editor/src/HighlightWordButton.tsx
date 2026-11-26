import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { Highlighter, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Popover, PopoverContent } from "@/components/ui/popover.tsx";
import { i18n } from "./i18n.ts";
import { activeHighlightSet, highlightWordIn, highlightWordText, setHighlightWord, useHighlightState } from "./highlight-sets.ts";
import { HighlightColorChoice } from "./shell/HighlightSetSettings.tsx";
import { inToolbarLayer, TOOLBAR_LAYER } from "./selection-toolbar-layer.ts";
import type { RefObject } from "react";

/** One line of selected text, as a highlight entry. */
function selectedWord(editor: Editor): string | null {
  const { from, to, empty } = editor.state.selection;
  if (empty) return null;
  const text = editor.state.doc.textBetween(from, to, "\n", "\n");
  return text.includes("\n") ? null : highlightWordText(text);
}

/**
 * The selection toolbar's Highlight (#2020): puts the selected word or phrase into the document's
 * current set in a palette color, changes its color or removes it. The Popover counts as part of the
 * toolbar, so the editor keeps its selection and the toolbar stays open while a color is chosen.
 */
export function HighlightWordButton({ editor, path, toolbarRef, onLeave }: { editor: Editor; path: string; toolbarRef: RefObject<HTMLDivElement | null>; onLeave(): void }) {
  const state = useHighlightState();
  const word = useEditorState({ editor, selector: ({ editor: current }) => selectedWord(current) });
  const active = activeHighlightSet(path, state);
  const existing = active && word ? highlightWordIn(active.set, word) : undefined;
  const reason = !active ? i18n.t("Turn on a highlight set first") : !word ? i18n.t("Select one line of text") : undefined;
  const label = i18n.t("Highlight");
  // Closing outside the toolbar and the editor leaves the selection's toolbar too.
  const closed = (open: boolean) => {
    if (!open) requestAnimationFrame(() => {
      const focused = document.activeElement;
      if (!toolbarRef.current?.contains(focused) && !editor.view.dom.contains(focused) && !inToolbarLayer(focused)) onLeave();
    });
  };
  return <Popover onOpenChange={closed}>
    <PopoverPrimitive.Trigger render={<Button variant="ghost" size="icon-sm" aria-label={label} title={reason ? `${label} — ${reason}` : label}
      aria-description={reason} data-testid="highlight-word-button" onMouseDown={event => event.preventDefault()} />}>
      <Highlighter aria-hidden="true" size={16} />
    </PopoverPrimitive.Trigger>
    <PopoverContent side="bottom" align="end" className="highlight-word-popover" data-testid="highlight-word-popover" {...{ [TOOLBAR_LAYER]: "" }}>
      {active && word ? <><p className="highlight-word-popover-title">
        <strong>{word}</strong><span>{active.set.name}</span>
      </p>
      <HighlightColorChoice value={existing?.color ?? null} onChange={color => setHighlightWord(active.set.id, word, color)} />
      {existing ? <div className="highlight-word-popover-actions">
        <Button type="button" variant="ghost" size="sm" onClick={() => setHighlightWord(active.set.id, word, null)}>
          <X aria-hidden="true" />{i18n.t("Remove highlight")}
        </Button>
      </div> : null}</> : <p className="highlight-word-popover-title">{reason}</p>}
    </PopoverContent>
  </Popover>;
}
