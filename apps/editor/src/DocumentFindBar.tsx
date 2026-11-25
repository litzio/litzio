import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { CaseSensitive, ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { i18n } from "./i18n.ts";
import { closeFindTransaction, findActive, findMatches, findStep, findTransaction, selectedFindText } from "./document-find.ts";
import { documentContentBounds } from "./document-scroll.ts";
import { FIND_NEXT_SHORTCUT, FIND_PREVIOUS_SHORTCUT, FIND_SHORTCUT } from "./shortcuts.ts";

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
export const DocumentFindBar = forwardRef<DocumentFindHandle, { editor: Editor; visible: boolean }>(function DocumentFindBar({ editor, visible }, ref) {
  useTranslation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [frame, setFrame] = useState<{ host: HTMLElement; viewport: HTMLElement } | null>(null);
  const [place, setPlace] = useState<CSSProperties>();
  const bar = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const count = useEditorState({ editor, selector: ({ editor: current }) => {
    const { matches, current: index } = findMatches(current.state);
    return { total: matches.length, current: index };
  } });

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
  }, [editor, frame, reveal, cancel]);

  const move = useCallback((direction: 1 | -1) => {
    flush();
    if (!findActive(editor.state)) return;
    const before = frame?.viewport.scrollTop ?? 0;
    findStep(direction)(editor.state, editor.view.dispatch);
    reveal(before);
  }, [editor, frame, reveal, flush]);

  const openFind = useCallback(() => {
    const seed = selectedFindText(editor.state);
    const value = seed || text;
    if (seed) setText(seed);
    setOpen(true);
    setFocusRequest(request => request + 1);
    if (!open || seed) search(value, caseSensitive);
  }, [editor, text, open, caseSensitive, search]);

  const close = useCallback(() => {
    cancel();
    setOpen(false);
    editor.view.dispatch(closeFindTransaction(editor.state));
    // Read has no editable focus target of its own; focus the root first, as other Read entry points do.
    if (!editor.isEditable) editor.view.dom.focus({ preventScroll: true });
    editor.view.focus();
  }, [editor, cancel]);

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
      if (FIND_SHORTCUT.matches(event)) {
        event.preventDefault(); event.stopPropagation();
        openFind();
      } else if (open && event.key === "F3" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault(); event.stopPropagation();
        move(event.shiftKey ? -1 : 1);
      }
    };
    frame.host.addEventListener("keydown", key, true);
    return () => frame.host.removeEventListener("keydown", key, true);
  }, [frame, open, openFind, move]);

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
      <Input ref={input} className="document-find-input h-[var(--size-control-compact)]" value={text} aria-label={i18n.t("Find in document")} placeholder={i18n.t("Find")}
        aria-invalid={none || undefined} spellCheck={false} data-testid="document-find-input"
        onChange={event => { setText(event.target.value); search(event.target.value, caseSensitive, true); }}
        onKeyDown={event => {
          if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
          event.preventDefault();
          move(event.shiftKey ? -1 : 1);
        }} />
      <span className="document-find-count type-helper" aria-live="polite" data-none={none || undefined} data-testid="document-find-count">
        {position}{none ? <span className="sr-only"> {i18n.t("No results")}</span> : null}
      </span>
      <Button type="button" variant="ghost" size="icon-sm" aria-pressed={caseSensitive} data-testid="document-find-case"
        aria-label={i18n.t("Match case")} title={i18n.t("Match case")}
        onClick={() => { setCaseSensitive(!caseSensitive); search(text, !caseSensitive); }}>
        <CaseSensitive aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" disabled={!count.total} data-testid="document-find-previous"
        aria-label={i18n.t("Previous match")} title={`${i18n.t("Previous match")} (Shift+Enter, ${FIND_PREVIOUS_SHORTCUT.label})`}
        onClick={() => move(-1)}>
        <ChevronUp aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" disabled={!count.total} data-testid="document-find-next"
        aria-label={i18n.t("Next match")} title={`${i18n.t("Next match")} (Enter, ${FIND_NEXT_SHORTCUT.label})`}
        onClick={() => move(1)}>
        <ChevronDown aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" data-testid="document-find-close"
        aria-label={i18n.t("Close")} title={`${i18n.t("Close")} (Esc)`} onClick={close}>
        <X aria-hidden="true" />
      </Button>
    </div>,
    frame.host,
  );
});
