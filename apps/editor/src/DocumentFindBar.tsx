import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { CaseSensitive, ChevronDown, ChevronUp, Replace, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Status } from "@/components/ui/status.tsx";
import { i18n } from "./i18n.ts";
import { closeFindTransaction, findActive, findMatches, findStep, findTransaction, selectedFindText } from "./document-find.ts";
import { documentContentBounds } from "./document-scroll.ts";
import { editorDocumentJSON } from "./editor-schema.tsx";
import { replaceFoundText } from "./document-replace.ts";
import type { TiptapJSON } from "./tiptap-document.ts";
import { isInputHeld } from "./read-only-boundary.ts";
import { FIND_NEXT_SHORTCUT, FIND_PREVIOUS_SHORTCUT, FIND_SHORTCUT, REPLACE_SHORTCUT } from "./shortcuts.ts";

export type DocumentFindHandle = { open(): void };

/** The scroll areas a find bar belongs to: a document tab and a plugin screen's document view. */
const FIND_VIEWPORTS = ".document-scroll, .screen-document-view-scroll";
/** A search slower than this makes typing wait for a pause of TYPING_PAUSE_MS. */
const SLOW_SEARCH_MS = 50;
const TYPING_PAUSE_MS = 250;

/**
 * Find in document (#1982): a small bar over the top-right corner of the document's own scroll area.
 * It never pushes the document. Ctrl/Cmd+F opens it while focus is inside that area.
 */
export const DocumentFindBar = forwardRef<DocumentFindHandle, {
  editor: Editor;
  visible: boolean;
  validateReplacement?(candidate: TiptapJSON, signal: AbortSignal): Promise<unknown>;
}>(function DocumentFindBar({ editor, visible, validateReplacement }, ref) {
  useTranslation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replacement, setReplacement] = useState("");
  const [replaceResult, setReplaceResult] = useState<{ count: number } | { error: string }>();
  const [checking, setChecking] = useState<"one" | "all" | null>(null);
  const replacementRequest = useRef<AbortController | null>(null);
  const canReplace = !!validateReplacement;
  const [focusRequest, setFocusRequest] = useState(0);
  const [frame, setFrame] = useState<{ host: HTMLElement; viewport: HTMLElement } | null>(null);
  const [place, setPlace] = useState<CSSProperties>();
  const bar = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const count = useEditorState({ editor, selector: ({ editor: current }) => {
    const { matches, current: index } = findMatches(current.state);
    return { total: matches.length, current: index, held: isInputHeld(current.state) };
  } });

  const cancelReplacement = useCallback(() => {
    replacementRequest.current?.abort();
    replacementRequest.current = null;
    setChecking(null);
    setReplaceResult(undefined);
  }, []);
  useEffect(() => {
    if (!visible || !canReplace) cancelReplacement();
    if (!canReplace) setReplaceOpen(false);
    return () => { replacementRequest.current?.abort(); };
  }, [visible, canReplace, cancelReplacement]);

  useLayoutEffect(() => {
    const viewport = visible ? editor.view.dom.closest<HTMLElement>(FIND_VIEWPORTS) : null;
    setFrame(viewport?.parentElement ? { host: viewport.parentElement, viewport } : null);
  }, [editor, visible]);

  // Bring the current match into view; when it was outside the view (or under this bar), near the middle.
  const reveal = useCallback((before: number) => {
    const viewport = frame?.viewport;
    if (!viewport || !findActive(editor.state) || findMatches(editor.state).current < 0) return;
    const { from, to } = editor.state.selection;
    const start = editor.view.coordsAtPos(from), end = editor.view.coordsAtPos(to);
    const bounds = viewport.getBoundingClientRect();
    const top = Math.max(bounds.top, bar.current?.getBoundingClientRect().bottom ?? bounds.top);
    if (viewport.scrollTop === before && start.top >= top && end.bottom <= bounds.bottom) return;
    viewport.scrollTop += (start.top + end.bottom) / 2 - (bounds.top + bounds.height / 2);
  }, [editor, frame]);

  // Redrawing every highlight of a large document takes long. After one slow search, typing waits for
  // a short pause before searching again; the field itself always shows each key at once.
  const slow = useRef(false);
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; run(): void } | null>(null);
  const cancel = useCallback(() => {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
  }, []);
  const flush = useCallback(() => {
    const queued = pending.current;
    cancel();
    queued?.run();
  }, [cancel]);
  useEffect(() => cancel, [cancel]);

  const search = useCallback((value: string, matchCase: boolean, typing = false) => {
    cancelReplacement();
    const run = () => {
      if (editor.isDestroyed) return;
      const before = frame?.viewport.scrollTop ?? 0;
      const start = performance.now();
      editor.view.dispatch(findTransaction(editor.state, { text: value, caseSensitive: matchCase }));
      slow.current = performance.now() - start > SLOW_SEARCH_MS;
      reveal(before);
    };
    cancel();
    if (!typing || !slow.current) run();
    else pending.current = { run, timer: setTimeout(() => { pending.current = null; run(); }, TYPING_PAUSE_MS) };
  }, [editor, frame, reveal, cancel, cancelReplacement]);

  const move = useCallback((direction: 1 | -1) => {
    if (replacementRequest.current) return;
    flush();
    if (!findActive(editor.state)) return;
    const before = frame?.viewport.scrollTop ?? 0;
    findStep(direction)(editor.state, editor.view.dispatch);
    reveal(before);
  }, [editor, frame, reveal, flush]);

  const openFind = useCallback(() => {
    if (replacementRequest.current) return;
    const seed = selectedFindText(editor.state);
    const value = seed || text;
    if (seed) setText(seed);
    setOpen(true);
    setFocusRequest(request => request + 1);
    if (!open || seed) search(value, caseSensitive);
  }, [editor, text, open, caseSensitive, search]);

  const close = useCallback(() => {
    cancel();
    cancelReplacement();
    setReplaceOpen(false);
    setOpen(false);
    editor.view.dispatch(closeFindTransaction(editor.state));
    // Read has no editable focus target of its own; focus the root first, as other Read entry points do.
    if (!editor.isEditable) editor.view.dom.focus({ preventScroll: true });
    editor.view.focus();
  }, [editor, cancel, cancelReplacement]);

  const applyReplacement = async (all: boolean) => {
    if (replacementRequest.current) return;
    flush();
    const state = editor.state;
    if (!validateReplacement || !editor.isEditable || editor.view.composing || isInputHeld(state)) return;
    const request = new AbortController();
    replacementRequest.current = request;
    setReplaceResult(undefined);
    try {
      const change = replaceFoundText(state, replacement, all);
      if (!change) throw new Error(i18n.t("The replacement would change the document structure."));
      if (change.tr.docChanged) {
        setChecking(all ? "all" : "one");
        const candidate = change.tr.doc.toJSON() as TiptapJSON;
        candidate.attrs = editorDocumentJSON(state).attrs;
        await validateReplacement(candidate, request.signal);
        if (request.signal.aborted || editor.isDestroyed || !editor.isEditable) return;
        if (editor.state !== state) throw new Error(i18n.t("The editor changed. Try again."));
      }
      const before = frame?.viewport.scrollTop ?? 0;
      if (change.tr.docChanged || change.tr.selectionSet) editor.view.dispatch(change.tr);
      if (change.tr.docChanged && editor.state.doc === state.doc) {
        throw new Error(i18n.t("The replacement would change the document structure."));
      }
      if (!all) reveal(before);
      setReplaceResult({ count: change.replaced });
    } catch (error) {
      if (!request.signal.aborted) setReplaceResult({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      if (replacementRequest.current === request) {
        replacementRequest.current = null;
        setChecking(null);
      }
    }
  };

  useImperativeHandle(ref, () => ({ open: openFind }), [openFind]);

  useLayoutEffect(() => {
    if (!focusRequest || !open || !frame) return;
    input.current?.focus({ preventScroll: true });
    input.current?.select();
  }, [focusRequest, open, frame, !!place]);

  // Ctrl/Cmd+F anywhere in this document's area, including this bar; F3 steps while the bar is open.
  useEffect(() => {
    if (!frame) return;
    const key = (event: KeyboardEvent) => {
      if (canReplace && REPLACE_SHORTCUT.matches(event)) {
        event.preventDefault(); event.stopPropagation();
        openFind();
        setReplaceOpen(true);
      } else if (FIND_SHORTCUT.matches(event)) {
        event.preventDefault(); event.stopPropagation();
        openFind();
      } else if (open && event.key === "F3" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault(); event.stopPropagation();
        move(event.shiftKey ? -1 : 1);
      }
    };
    frame.host.addEventListener("keydown", key, true);
    return () => frame.host.removeEventListener("keydown", key, true);
  }, [frame, open, openFind, move, canReplace]);

  // Follow the document area: window size, docked panels and an outer scroll (a plugin screen).
  useLayoutEffect(() => {
    if (!frame || !open) return;
    const measure = () => {
      const bounds = documentContentBounds(frame.viewport);
      setPlace({ "--find-top": `${bounds.y}px`, "--find-right": `${window.innerWidth - bounds.x - bounds.width}px`,
        "--find-width": `${bounds.width}px` } as CSSProperties);
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(frame.viewport);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      resize.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [frame, open]);

  if (!open || !frame || !place) return null;
  const none = text !== "" && count.total === 0;
  const position = count.total ? `${count.current + 1 || "–"} / ${count.total}` : text ? "0" : "";
  return createPortal(
    <div ref={bar} className="document-find" role="search" aria-label={i18n.t("Find in document")} style={place} data-testid="document-find"
      onKeyDown={event => {
        if (event.key === "Escape" && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); close(); }
      }}>
      <div className="document-find-row">
        {canReplace ? <Button type="button" variant="ghost" size="icon-sm" aria-expanded={replaceOpen} disabled={!!checking}
          aria-label={i18n.t("Replace in document")} title={`${i18n.t("Replace in document")} (${REPLACE_SHORTCUT.label})`}
          onClick={() => { cancelReplacement(); setReplaceOpen(!replaceOpen); }}>
          <Replace aria-hidden="true" />
        </Button> : null}
        <Input ref={input} className="document-find-input h-[var(--size-control-compact)]" value={text} aria-label={i18n.t("Find in document")} placeholder={i18n.t("Find")}
          aria-invalid={none || undefined} readOnly={!!checking} spellCheck={false} data-testid="document-find-input"
          onChange={event => { setText(event.target.value); search(event.target.value, caseSensitive, true); }}
          onKeyDown={event => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            move(event.shiftKey ? -1 : 1);
          }} />
        <span className="document-find-count type-helper" aria-live="polite" data-none={none || undefined} data-testid="document-find-count">
          {position}{none ? <span className="sr-only"> {i18n.t("No results")}</span> : null}
        </span>
        <Button type="button" variant="ghost" size="icon-sm" aria-pressed={caseSensitive} disabled={!!checking} data-testid="document-find-case"
          aria-label={i18n.t("Match case")} title={i18n.t("Match case")}
          onClick={() => { setCaseSensitive(!caseSensitive); search(text, !caseSensitive); }}>
          <CaseSensitive aria-hidden="true" />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" disabled={!!checking || !count.total} data-testid="document-find-previous"
          aria-label={i18n.t("Previous match")} title={`${i18n.t("Previous match")} (Shift+Enter, ${FIND_PREVIOUS_SHORTCUT.label})`}
          onClick={() => move(-1)}>
          <ChevronUp aria-hidden="true" />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" disabled={!!checking || !count.total} data-testid="document-find-next"
          aria-label={i18n.t("Next match")} title={`${i18n.t("Next match")} (Enter, ${FIND_NEXT_SHORTCUT.label})`}
          onClick={() => move(1)}>
          <ChevronDown aria-hidden="true" />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" data-testid="document-find-close"
          aria-label={i18n.t("Close")} title={`${i18n.t("Close")} (Esc)`} onClick={close}>
          <X aria-hidden="true" />
        </Button>
      </div>
      {canReplace && replaceOpen ? <>
        <div className="document-find-row document-replace-row">
          <Input className="document-find-input h-[var(--size-control-compact)]" value={replacement}
            aria-label={i18n.t("Replacement text")} placeholder={i18n.t("Replacement text")} readOnly={!!checking} spellCheck={false}
            onChange={event => { cancelReplacement(); setReplacement(event.target.value); }}
            onKeyDown={event => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
              event.preventDefault();
              void applyReplacement(false);
            }} />
          <Button type="button" variant="outline" size="sm" disabled={!!checking || count.held || count.current < 0}
            onClick={() => void applyReplacement(false)}>{i18n.t("Replace")}</Button>
          <Button type="button" variant="outline" size="sm" disabled={!!checking || count.held || !count.total} aria-busy={checking === "all" || undefined}
            onClick={() => void applyReplacement(true)}>{i18n.t("Replace all")}</Button>
        </div>
        <div className="document-replace-result type-helper" role="status" data-error={replaceResult && "error" in replaceResult || undefined}>
          {checking === "all" ? <Status tone="progress" variant="plain" label={i18n.t("Replacing…")} /> : replaceResult && ("error" in replaceResult
            ? i18n.t("Could not replace text. {{reason}}", { reason: replaceResult.error })
            : i18n.t("Replacements: {{count}}", { count: replaceResult.count }))}
        </div>
      </> : null}
    </div>,
    frame.host,
  );
});
