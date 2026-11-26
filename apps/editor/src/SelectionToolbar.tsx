import { EDITOR_SHORTCUTS, LINK_SHORTCUT, PROPERTY_APPLY_SHORTCUT } from "./shortcuts.ts";
import { messageText, useMessageState } from "./ui-message.ts";
import { useTranslation } from "react-i18next";
import { i18n } from "./i18n.ts";
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { useEditorState } from "@tiptap/react";
import { canEditEndnoteAt, endnoteAt, endnoteEditorToken, insertEndnote } from "./endnotes.ts";
import { freshBlockPath } from "./tiptap-document.ts";
import { Asterisk, Bold, Bookmark, Code, Italic, Link2, Sigma, Strikethrough, Subscript, Superscript } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties, type RefObject } from "react";
import { useEditorAuthoring, useEditorContentOnly } from "./editor-visibility.ts";
import type { DraftListener } from "./node-views/shared.ts";
import { FieldError } from "./ui/primitives.tsx";
import { Input } from "@/components/ui/input.tsx";
import { externalLinkUrl, fragmentTarget, openExternalLink, unresolvedLink } from "./link-opening.ts";
import { hasSectionLabel, insertSectionLabel, newSectionLabel } from "./cross-reference.tsx";
import { LinkTargetPicker, resolveLinkTargetChoice, sectionLinkMatchesHeading } from "./LinkTargetPicker.tsx";
import { Button } from "@/components/ui/button.tsx";
import { HighlightWordButton } from "./HighlightWordButton.tsx";
import { inToolbarLayer } from "./selection-toolbar-layer.ts";
import { useOverlayBounds, type OverlayAnchor } from "./ui/use-overlay-bounds.ts";

/** Icon buttons name their action, and its shortcut when one exists, in a tooltip. */
const tip = (label: string, shortcut?: { label: string }) => (shortcut ? `${label} (${shortcut.label})` : label);

/**
 * Inline marks for selections in paragraphs, headings, quotes and simple admonition bodies.
 * Tab from the selection enters it; Escape, or Shift+Tab from its first button, returns to the
 * editor and its selection.
 */
export function SelectionToolbar({ editor, style, anchor, toolbarRef, onLeave, onReject, onEditLink, onEditReference, highlightPath }: {
  editor: Editor;
  /** The document whose highlight set takes the selected word (#2020). */
  highlightPath?: string;
  style: CSSProperties;
  anchor: OverlayAnchor;
  toolbarRef: RefObject<HTMLDivElement | null>;
  /** Focus left both the toolbar and the editor. */
  onLeave: () => void;
  onReject: () => void;
  onEditLink: () => void;
  onEditReference: () => void;
}) {
  useTranslation();
  const contentOnly = useEditorContentOnly();
  const bounds = useOverlayBounds<HTMLDivElement>(true, anchor);
  return (
    <div ref={element => { bounds.current = element; toolbarRef.current = element; }}
      className="selection-toolbar" role="toolbar" aria-label={i18n.t("Text formatting")} style={style} data-testid="selection-toolbar"
      onKeyDown={(event) => {
        const back = event.key === "Tab" && event.shiftKey && event.target === event.currentTarget.querySelector("button");
        if (event.key !== "Escape" && !back) return;
        event.preventDefault();
        editor.commands.focus();
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (!event.currentTarget.contains(next) && !editor.view.dom.contains(next) && !inToolbarLayer(next)) onLeave();
      }}
    >
      <Button variant="ghost" size="icon-sm"
        aria-label={i18n.t("Bold")} title={tip(i18n.t("Bold"), EDITOR_SHORTCUTS.bold)} aria-keyshortcuts={EDITOR_SHORTCUTS.bold.aria}
        aria-pressed={editor.isActive("bold")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => toggleMark(editor, "bold", onReject)}
      >
        <Bold aria-hidden="true" size={16} />
      </Button>
      <Button variant="ghost" size="icon-sm"
        aria-label={i18n.t("Italic")} title={tip(i18n.t("Italic"), EDITOR_SHORTCUTS.italic)} aria-keyshortcuts={EDITOR_SHORTCUTS.italic.aria}
        aria-pressed={editor.isActive("italic")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => toggleMark(editor, "italic", onReject)}
      >
        <Italic aria-hidden="true" size={16} />
      </Button>
      <Button variant="ghost" size="icon-sm"
        aria-label={i18n.t("Strikethrough")} title={tip(i18n.t("Strikethrough"), EDITOR_SHORTCUTS.strike)} aria-keyshortcuts={EDITOR_SHORTCUTS.strike.aria}
        aria-pressed={editor.isActive("strike")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => toggleMark(editor, "strike", onReject)}
      >
        <Strikethrough aria-hidden="true" size={16} />
      </Button>
      <Button variant="ghost" size="icon-sm"
        aria-label={i18n.t("Subscript")} title={tip(i18n.t("Subscript"), EDITOR_SHORTCUTS.subscript)}
        aria-pressed={editor.isActive("subscript")}
        aria-keyshortcuts={EDITOR_SHORTCUTS.subscript.aria}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => toggleMark(editor, "subscript", onReject)}
      >
        <Subscript aria-hidden="true" size={16} />
      </Button>
      <Button variant="ghost" size="icon-sm"
        aria-label={i18n.t("Superscript")} title={tip(i18n.t("Superscript"), EDITOR_SHORTCUTS.superscript)}
        aria-pressed={editor.isActive("superscript")}
        aria-keyshortcuts={EDITOR_SHORTCUTS.superscript.aria}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => toggleMark(editor, "superscript", onReject)}
      >
        <Superscript aria-hidden="true" size={16} />
      </Button>
      <Button variant="ghost" size="icon-sm"
        aria-label={i18n.t("Inline code")} title={tip(i18n.t("Inline code"), EDITOR_SHORTCUTS.code)} aria-keyshortcuts={EDITOR_SHORTCUTS.code.aria}
        aria-pressed={editor.isActive("code")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => toggleMark(editor, "code", onReject)}
      >
        <Code aria-hidden="true" size={16} />
      </Button>
      <Button variant="ghost" size="icon-sm"
        aria-label={i18n.t("Link")} title={`${i18n.t("Link")} (${LINK_SHORTCUT.label})`} aria-keyshortcuts={LINK_SHORTCUT.aria}
        aria-pressed={editor.isActive("link")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => (editableInlineContext(editor) ? onEditLink() : onReject())}
      >
        <Link2 aria-hidden="true" size={16} />
      </Button>
      <Button variant="ghost" size="icon-sm"
        aria-label={i18n.t("Inline math")} title={tip(i18n.t("Inline math"), EDITOR_SHORTCUTS.inlineMath)}
        aria-keyshortcuts={EDITOR_SHORTCUTS.inlineMath.aria}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => (makeInlineMath(editor) ? undefined : onReject())}
      >
        <Sigma aria-hidden="true" size={16} />
      </Button>
      <Button variant="ghost" size="icon-sm"
        aria-label={i18n.t("Cross-reference")} title={tip(i18n.t("Cross-reference"))}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => (editableInlineContext(editor) ? onEditReference() : onReject())}
      >
        <Bookmark aria-hidden="true" size={16} />
      </Button>
      {contentOnly ? null : <Button variant="ghost" size="icon-sm"
        aria-label={i18n.t("Endnote")} title={tip(i18n.t("Endnote"))}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => (endnoteAfterSelection(editor) ? undefined : onReject())}
      >
        <Asterisk aria-hidden="true" size={16} />
      </Button>}
      {highlightPath ? <HighlightWordButton editor={editor} path={highlightPath} toolbarRef={toolbarRef} onLeave={onLeave} /> : null}
    </div>
  );
}

/**
 * Turn the selected plain text into inline math whose LaTeX source is that text, keeping the
 * marks that cover the whole selection. Selections containing breaks or math are refused.
 */
export function makeInlineMath(editor: Editor): boolean {
  const { state } = editor;
  const { from, to, $from, $to } = state.selection;
  if (!editableInlineContext(editor) || from === to || !$from.sameParent($to)) return false;
  const source = state.doc.textBetween(from, to, "\n", "\n");
  if (source.length === 0 || source.includes("\n")) return false;
  const marks = $from.marksAcross($to) ?? [];
  return editor.chain().focus().insertContentAt({ from, to },
    { type: "inlineMath", attrs: { value: source }, marks: marks.map((mark) => mark.toJSON()) }).run();
}

/** Insert an endnote right after the selection through the `/` Endnote path, keeping the selected text. */
function endnoteAfterSelection(editor: Editor): boolean {
  const { to } = editor.state.selection;
  return editableInlineContext(editor) && insertEndnote(editor, { from: to, to }, freshBlockPath());
}

function toggleMark(editor: Editor, mark: "bold" | "italic" | "strike" | "subscript" | "superscript" | "code", onReject: () => void): void {
  if (!editableInlineContext(editor)) {
    onReject();
    return;
  }
  const chain = editor.chain().focus();
  const applied = (mark === "bold" ? chain.toggleBold() : mark === "italic" ? chain.toggleItalic()
    : mark === "strike" ? chain.toggleStrike() : mark === "subscript" ? chain.toggleSubscript()
    : mark === "superscript" ? chain.toggleSuperscript() : chain.toggleCode()).run();
  if (!applied) onReject();
}

function editableInlineContext(editor: Editor): boolean {
  const parent = editor.state.selection.$from.parent;
  return parent.type.name === "paragraph" ||
    parent.type.name === "quote" || parent.type.name === "footnoteDefinition" || parent.type.name === "heading" || parent.type.name === "figure" || parent.type.name === "tableCaption" || parent.type.name === "tableNote" || parent.type.name === "admonition";
}

/** The paragraph text range a link form edits, and the link already there, if any. */
export type LinkDraft = {
  from: number; to: number; path: string; href: string; title: string | null;
  lastValid: { doc: Editor["state"]["doc"]; from: number; to: number };
};

/** Open a link draft for the selection, widened to the whole link when it is inside one. */
export function linkDraftOf(editor: Editor): LinkDraft {
  if (editor.isActive("link")) editor.commands.extendMarkRange("link");
  const { from, to } = editor.state.selection;
  const attrs = editor.getAttributes("link");
  return {
    from,
    to,
    lastValid: { doc: editor.state.doc, from, to },
    path: String(editor.state.selection.$from.node(1).attrs.sourcePath),
    href: typeof attrs.href === "string" ? attrs.href : "",
    title: typeof attrs.title === "string" ? attrs.title : null,
  };
}

/**
 * Add, change or remove an ordinary Markdown link on the selected text. The change is an
 * ordinary editor transaction; Core validates the link when the document is saved.
 */
export function LinkForm({ editor, draft, style, anchor, onClose, onDraftChange, onReveal }: {
  editor: Editor;
  draft: LinkDraft;
  style?: CSSProperties;
  anchor: OverlayAnchor;
  onClose: () => void;
  onDraftChange: DraftListener;
  onReveal(index: number): void;
}) {
  useTranslation();
  const visible = useEditorAuthoring();
  const formId = useId();
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; }, []);
  const [href, setHref] = useState(draft.href);
  const [picking, setPicking] = useState(false);
  useEffect(() => { if (!visible) setPicking(false); }, [visible]);
  const [headingPath, setHeadingPath] = useState<string>();
  const pickerButton = useRef<HTMLButtonElement>(null);
  const urlInput = useRef<HTMLInputElement>(null);
  const bounds = useOverlayBounds<HTMLFormElement>(true, anchor);
  const [error, setError] = useMessageState("");
  const path = draft.path;
  const dirty = href !== draft.href || headingPath !== undefined;
  const canEdit = useEditorState({ editor, selector: ({ editor: current }) =>
    !!current?.isEditable && canEditEndnoteAt(current.state, draft.from) });
  useEffect(() => {
    onDraftChange("Link", path, dirty, formId);
    return () => onDraftChange("Link", path, false, formId);
  }, [path, dirty, onDraftChange, formId]);
  const close = () => {
    onClose();
    // Finish this form's focus return now. A queued Tiptap focus can otherwise blur a
    // subsequent link form opened by the shortcut before the next animation frame.
    editor.view.focus();
  };
  const closePicker = () => {
    setPicking(false);
    pickerButton.current?.focus();
  };
  const doc = editor.state.doc;
  const url = href.trim();
  let heading: number | undefined;
  if (headingPath !== undefined) doc.forEach((node, _pos, index) => {
    if (node.type.name === "heading" && node.attrs.sourcePath === headingPath) heading = index;
  });
  const target = headingPath === undefined ? fragmentTarget(doc, url) : heading;
  const external = externalLinkUrl(url);
  const openHint = external || target !== undefined ? i18n.t("Open") : url.startsWith("#")
    ? messageText(unresolvedLink(url)) : i18n.t("Enter an http(s) URL or a document link to open it.");
  const choose = (candidate: Parameters<typeof resolveLinkTargetChoice>[1]) => {
    setPicking(false);
    urlInput.current?.focus();
    const choice = resolveLinkTargetChoice(editor.state, candidate);
    if ("error" in choice) return setError(choice.error);
    setHref(choice.href);
    setHeadingPath(choice.headingPath);
    setError("");
  };
  const apply = () => {
    if (!canEdit) return;
    if (url.length === 0) return setError({ key: "Enter a URL." });
    if (/\s/.test(url)) return setError({ key: "A URL cannot contain spaces." });
    if (headingPath !== undefined && (heading === undefined || hasSectionLabel(doc, heading) || url !== `#${newSectionLabel(doc, heading)}`)) {
      return setError({ key: "The heading changed. Choose it again." });
    }
    if (heading !== undefined) {
      if (!sectionLinkMatchesHeading(editor.state, heading, url)) return setError({ key: "This link does not point to the selected block." });
      const $from = doc.resolve(draft.from);
      if (draft.from === draft.to || !$from.sameParent(doc.resolve(draft.to)) ||
          $from.depth === 0 || $from.node(1).attrs.sourcePath !== draft.path) {
        return setError({ key: "Selection is no longer within one text block. Undo the outside edit and try again." });
      }
    }
    // Keep an existing title; the form edits the URL only.
    if (!editor.can().setLink({ href: url, title: draft.title })) return setError({ key: "This URL cannot be used as a link." });
    editor.chain().setTextSelection({ from: draft.from, to: draft.to }).setLink({ href: url, title: draft.title })
      .command(({ tr }) => {
        if (heading !== undefined) insertSectionLabel(closeHistory(tr), heading, url.slice(1));
        return true;
      }).run();
    if (heading !== undefined) editor.view.dispatch(closeHistory(editor.state.tr));
    close();
  };
  const remove = () => {
    if (!canEdit) return;
    editor.chain().setTextSelection({ from: draft.from, to: draft.to }).unsetLink().run();
    close();
  };
  if (!visible) return null;
  return (
    <form
      ref={bounds}
      className="selection-toolbar link-form"
      role="dialog"
      aria-label={i18n.t("Link")}
      data-testid="link-form"
      data-endnote-editor={endnoteEditorToken(editor)}
      data-endnote-owner={endnoteAt(editor.state, draft.from) ?? ""}
      style={style}
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
      onKeyDown={(event) => {
        if (PROPERTY_APPLY_SHORTCUT.matches(event.nativeEvent)) {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.requestSubmit();
        }
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        if (picking) closePicker();
        else close();
      }}
    >
      <div className="form-field link-url-field">
        <div className="link-url-label">
          <label className="form-label" htmlFor={formId}>{i18n.t("Link URL")}</label>
          <Button ref={pickerButton} size="sm" variant="ghost" type="button" aria-expanded={picking}
            aria-controls={picking ? `${formId}-targets` : undefined} disabled={!canEdit}
            onClick={() => setPicking(!picking)}>{i18n.t("Choose document target")}</Button>
        </div>
        <Input
          ref={urlInput}
          id={formId}
          autoFocus={!mounted.current}
          aria-label={i18n.t("Link URL")}
          data-testid="link-url"
          placeholder="https://"
          value={href}
          disabled={!canEdit}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${formId}-error` : undefined}
          onChange={(event) => {
            setHref(event.target.value);
            setHeadingPath(undefined);
            setError("");
          }}
        />
        <FieldError id={`${formId}-error`}>{error}</FieldError>
      </div>
      {picking ? <LinkTargetPicker id={`${formId}-targets`} doc={doc} onChoose={choose} onClose={closePicker} /> : null}
      <div className="form-actions">
        <span title={openHint}>
          <Button size="sm" variant="outline" type="button" data-testid="link-open"
            disabled={!external && target === undefined} onClick={() => {
              if (target === undefined) openExternalLink(url);
              else onReveal(target);
            }}>{i18n.t("Open")}</Button>
        </span>
        {draft.href ? (
          <Button size="sm" variant="outline" disabled={!canEdit} data-testid="link-remove" onClick={remove}>{i18n.t("Remove")}</Button>
        ) : null}
        <Button size="sm" type="button" variant="outline" data-testid="link-cancel" onClick={close}>{i18n.t("Cancel")}</Button>
        <Button size="sm" type="submit" disabled={!canEdit} data-testid="link-apply">{i18n.t("Apply")}</Button>
      </div>
    </form>
  );
}
