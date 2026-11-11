import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NodeViewWrapper, useEditorState, type ReactNodeViewProps } from "@tiptap/react";
import { parseSource, requirementContentError, REQUIREMENT_STATUSES, REQUIREMENT_STRENGTHS, REQUIREMENT_TYPES, type RequirementContent } from "@litzio/core";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { i18n } from "../i18n.ts";
import { MetadataProperties } from "../metadata-properties.tsx";
import { useMessageState } from "../ui-message.ts";
import { FieldError } from "../ui/primitives.tsx";
import { requirementStatusLabel, requirementStrengthLabel, requirementTypeLabel } from "../requirement-labels.ts";
import { focusBlock } from "./shared.ts";

type Draft = { title: string; status: string; type: string; strength: string; sources: string; parents: string; body: string };
const lines = (value: string) => value.split(/\s+/).filter(Boolean);

function draftOf(attrs: Record<string, unknown>): Draft {
  return {
    title: String(attrs.title ?? ""), status: String(attrs.status ?? "draft"), type: String(attrs.type ?? "functional"), strength: String(attrs.strength ?? "shall"),
    sources: ((attrs.sources as string[] | undefined) ?? []).join("\n"), parents: ((attrs.parents as string[] | undefined) ?? []).join(" "), body: String(attrs.body ?? ""),
  };
}

/** Why a requirement properties draft cannot be applied, using Core's own validation. */
export function requirementDraftError(id: string, draft: Draft): string | undefined {
  const sources = [];
  for (const text of lines(draft.sources)) {
    const source = parseSource(text);
    if (!source) return i18n.t("Not a valid source link: {{link}}", { link: text });
    sources.push(source);
  }
  return requirementContentError({ id, title: draft.title.trim(), status: draft.status, type: draft.type, strength: draft.strength, sources, parents: lines(draft.parents), body: draft.body } as RequirementContent);
}

/**
 * A requirement block: persistent ID, title, status, type, strength, body and source links.
 * Attributes are edited in the properties panel (Apply/Cancel); the ID is shown but never editable.
 */
export function RequirementView({ node, editor, selected, getPos, view }: ReactNodeViewProps) {
  useTranslation();
  const editable = useEditorState({ editor, selector: ({ editor: current }) => current.isEditable });
  const formId = useId();
  const id = String(node.attrs.id ?? "");
  const current = draftOf(node.attrs);
  const anchor = useRef<HTMLDivElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(current);
  const [error, setError] = useMessageState("");
  const sources = (node.attrs.sources as string[] | undefined) ?? [];
  useEffect(() => { if (!open) setDraft(draftOf(node.attrs)); }, [open, node.attrs]);
  const change = (key: keyof Draft, value: string) => { setDraft(previous => ({ ...previous, [key]: value })); setError(""); };
  const begin = () => { if (!view.editable || open) return; setDraft(current); setError(""); setOpen(true); };
  const cancel = () => { setOpen(false); setError(""); setDraft(current); focusBlock(view, getPos); };
  const apply = (outside = false) => {
    const problem = requirementDraftError(id, draft);
    if (problem) { setError(problem); return; }
    const position = getPos();
    if (typeof position !== "number") return;
    const sourceList = lines(draft.sources);
    view.dispatch(view.state.tr.setNodeMarkup(position, undefined, { ...node.attrs, title: draft.title.trim(), status: draft.status, type: draft.type, strength: draft.strength,
      sources: sourceList, parents: lines(draft.parents), body: draft.body }));
    setOpen(false); setError("");
    if (!outside) focusBlock(view, getPos);
  };
  return (
    <NodeViewWrapper className="requirement" data-block="requirement" data-testid="requirement" data-requirement-id={id}
      data-status={current.status} data-strength={current.strength} data-selected={selected ? "true" : "false"}
      data-source-path={String(node.attrs.sourcePath ?? "")} contentEditable={false}>
      <div ref={anchor} className="requirement-card">
        <p className="requirement-head">
          <span className="requirement-id" data-testid="requirement-id">{id}</span>
          <span className="requirement-title" data-testid="requirement-title">{current.title}</span>
          <span className="requirement-badge" data-kind="status">{requirementStatusLabel(current.status)}</span>
          <span className="requirement-badge" data-kind="type">{requirementTypeLabel(current.type)}</span>
          <span className="requirement-badge" data-kind="strength">{requirementStrengthLabel(current.strength)}</span>
          {editable ? <Button type="button" size="sm" variant="outline" className="requirement-edit" data-testid="requirement-edit" aria-label={i18n.t("Edit requirement {{id}}", { id })} onClick={begin}>{i18n.t("Edit")}</Button> : null}
        </p>
        <p className="requirement-body" data-testid="requirement-body">{current.body}</p>
        {sources.length ? <p className="requirement-sources" data-testid="requirement-sources">
          <span className="requirement-sources-label">{i18n.t("Source")}</span>
          {sources.map(source => <code key={source} className="requirement-source">{source}</code>)}
        </p> : <p className="requirement-sources" data-state="orphan">{i18n.t("No source link")}</p>}
      </div>
      <MetadataProperties anchor={anchor} target={() => anchor.current} initialFocus={titleInput} kind={i18n.t("Requirement")} testId="requirement" open={open}
        onApply={apply} onCancel={cancel}>
        <div className="requirement-form">
          <div className="form-field">
            <label className="form-label" htmlFor={`${formId}-id`}>{i18n.t("Requirement ID")}</label>
            <Input id={`${formId}-id`} data-testid="requirement-field-id" value={id} readOnly aria-describedby={`${formId}-id-note`} />
            <p id={`${formId}-id-note`} className="form-hint">{i18n.t("The ID is permanent and cannot be changed.")}</p>
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor={`${formId}-title`}>{i18n.t("Requirement title")}</label>
            <Input ref={titleInput} id={`${formId}-title`} data-testid="requirement-field-title" value={draft.title} onChange={event => change("title", event.target.value)} />
          </div>
          <div className="requirement-form-row">
            {([["status", "Status", REQUIREMENT_STATUSES, requirementStatusLabel], ["type", "Requirement type", REQUIREMENT_TYPES, requirementTypeLabel], ["strength", "Requirement strength", REQUIREMENT_STRENGTHS, requirementStrengthLabel]] as const).map(([key, label, values, name]) => (
              <div className="form-field" key={key}>
                <label className="form-label" htmlFor={`${formId}-${key}`}>{i18n.t(label)}</label>
                <select id={`${formId}-${key}`} className="reference-target" data-testid={`requirement-field-${key}`} value={draft[key]} onChange={event => change(key, event.target.value)}>
                  {values.map(value => <option key={value} value={value}>{name(value)}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor={`${formId}-body`}>{i18n.t("Requirement text")}</label>
            <textarea id={`${formId}-body`} className="requirement-textarea document-source-input" data-testid="requirement-field-body" value={draft.body} onChange={event => change("body", event.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor={`${formId}-sources`}>{i18n.t("Source links (one per line)")}</label>
            <textarea id={`${formId}-sources`} className="requirement-textarea document-source-input" data-testid="requirement-field-sources" value={draft.sources} onChange={event => change("sources", event.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor={`${formId}-parents`}>{i18n.t("Parent requirement IDs (optional)")}</label>
            <Input id={`${formId}-parents`} data-testid="requirement-field-parents" value={draft.parents} placeholder={i18n.t("None")} onChange={event => change("parents", event.target.value)} />
          </div>
          <FieldError id={`${formId}-error`}>{error}</FieldError>
        </div>
      </MetadataProperties>
    </NodeViewWrapper>
  );
}
