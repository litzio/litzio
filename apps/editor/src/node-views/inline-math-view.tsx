import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { NodeSelection } from "@tiptap/pm/state";
import { NodeViewWrapper, useEditorState, type ReactNodeViewProps } from "@tiptap/react";
import { FieldError } from "../ui/primitives.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useMessageState } from "../ui-message.ts";
import { i18n } from "../i18n.ts";
import { BlockProperties } from "../block-properties.tsx";
import { canEditEndnoteAt, endnoteAt, endnoteEditorToken } from "../endnotes.ts";
import { renderEquation } from "../equation-render.ts";
import { EquationFormula } from "./equation-view.tsx";
import { focusBlock, usePropertyEntry, type DraftListener } from "./shared.ts";

export function InlineMathView({ node, editor, getPos, updateAttributes, selected }: ReactNodeViewProps) {
  const anchor = useRef<HTMLSpanElement>(null);
  const value = String(node.attrs.value ?? "");
  const [editing, setEditing] = useState(false);
  const canEdit = useEditorState({ editor, selector: ({ editor: current }) => {
    const pos = getPos();
    return !!current && typeof pos === "number" && canEditEndnoteAt(current.state, pos);
  } });
  const rendered = renderEquation(value, false);
  const open = () => {
    if (!editor.isEditable || !canEdit || editing) return;
    setEditing(true);
  };
  usePropertyEntry(anchor, open);
  const position = getPos();
  const endnoteOwner = typeof position === "number" ? endnoteAt(editor.state, position) : null;
  const path = typeof position === "number" ? String(editor.state.doc.resolve(position).node(1).attrs.sourcePath) : "";
  const onDraftChange = editor.extensionManager.extensions.find(extension => extension.name === "inlineMath")?.options.onDraftChange as DraftListener | undefined;
  const close = () => {
    setEditing(false);
    focusBlock(editor.view, getPos);
  };
  const apply = (source: string) => {
    if (!canEdit) return;
    updateAttributes({ value: source });
    close();
  };
  // Replace the math with its source as ordinary text, keeping bold/italic/link marks.
  const remove = () => {
    if (!canEdit) return;
    const position = getPos();
    if (typeof position !== "number") return;
    setEditing(false);
    editor.chain().focus().insertContentAt({ from: position, to: position + node.nodeSize },
      { type: "text", text: value, marks: node.marks.map((mark) => mark.toJSON()) }).run();
  };
  return (
    <NodeViewWrapper as="span" className="inline-math" data-selected={selected ? "true" : "false"} data-testid="inline-math">
      <span
        ref={anchor}
        contentEditable={false}
        className={rendered.html ? "inline-math-rendered" : "inline-math-rendered inline-math-error"}
        title={rendered.error ?? value}
        onMouseDown={event => {
          const position = getPos();
          if (typeof position !== "number") return;
          event.preventDefault();
          editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, position)));
          editor.view.focus();
        }}
        onDoubleClick={open}
        {...(rendered.html ? { dangerouslySetInnerHTML: { __html: rendered.html } } : { children: `$${value}$` })}
      />
      {editing ? <InlineMathProperties anchor={anchor} value={value} path={path} busy={!canEdit}
        endnoteOwner={endnoteOwner ? { label: endnoteOwner, editor: endnoteEditorToken(editor) } : undefined}
        onDraftChange={onDraftChange} onApply={apply} onCancel={close} onRemove={remove} /> : null}
    </NodeViewWrapper>
  );
}

export function InlineMathProperties({ anchor, value, path, busy, endnoteOwner, onDraftChange, onApply, onCancel, onRemove }: {
  anchor: RefObject<HTMLElement | null>;
  value: string;
  path: string;
  busy: boolean;
  endnoteOwner?: { label: string; editor: string };
  onDraftChange?: DraftListener;
  onApply(source: string): void;
  onCancel(): void;
  onRemove?(): void;
}) {
  useTranslation();
  const formId = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useMessageState("");
  const dirty = draft !== value;
  useEffect(() => {
    onDraftChange?.("Inline math", path, dirty, formId);
    return () => onDraftChange?.("Inline math", path, false, formId);
  }, [path, dirty, onDraftChange, formId]);
  return (
    <BlockProperties anchor={anchor} initialFocus={input} kind={i18n.t("Inline math")} testId="inline-math" className="inline-math-properties"
      endnoteOwner={endnoteOwner} open busy={busy} onCancel={onCancel} onApply={() => {
        // Core validates round-trip preservation on Save.
        if (!draft.length) return setError({ key: onRemove ? "Enter LaTeX, or use Remove." : "Enter LaTeX." });
        onApply(draft);
      }}>
      <div className="form-field">
        <label className="form-label" htmlFor={formId}>LaTeX</label>
        <textarea
          id={formId}
          ref={input}
          className="inline-math-input"
          aria-label="LaTeX"
          data-testid="inline-math-source"
          value={draft}
          disabled={busy}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${formId}-error` : undefined}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          onChange={(event) => {
            setDraft(event.target.value.replace(/[\r\n]+/g, " "));
            setError("");
          }}
        />
        {draft.length ? <EquationFormula className="equation-math inline-math-preview" latex={draft} testId="inline-math-preview" inline /> : null}
        <FieldError id={`${formId}-error`}>{error}</FieldError>
      </div>
      {onRemove ? <Button type="button" size="sm" variant="outline" data-testid="inline-math-remove" disabled={busy} onClick={onRemove}>{i18n.t("Remove")}</Button> : null}
    </BlockProperties>
  );
}
