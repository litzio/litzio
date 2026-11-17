import { forwardRef, useId, useImperativeHandle, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import { DOCUMENT_STATUSES, type DocumentStatus } from "@litzio/core";
import { DEFAULT_REFERENCE_TEMPLATES, type ReferenceTemplates } from "@litzio/core/numbering";
import { Button } from "@/components/ui/button.tsx";
import { SettingsRow, SettingsSelect, SettingsSwitch, SelectControl } from "@/components/ui/settings.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip.tsx";
import { Status } from "@/components/ui/status.tsx";
import { i18n } from "../i18n.ts";
import { REFERENCE_STYLES, referenceStyle, type ReferenceStyle } from "../reference-style.ts";

export type DocumentSettingsHandle = { reveal(): void };
type Props = {
  expanded: boolean;
  onExpandedChange(expanded: boolean): void;
  readOnly: boolean;
  disabled: boolean;
  headingNumbering: boolean;
  status: DocumentStatus | null;
  onStatusChange(status: DocumentStatus | null): void;
  numberingMode: "automatic" | "fixed" | "mixed";
  onNumberingModeChange(mode: "automatic" | "fixed"): void;
  referenceTemplates: ReferenceTemplates | null;
  bibliography: string[];
  onToggleHeadingNumbering(): void;
  onReferenceStyleChange(style: ReferenceStyle): void;
  onConnectBibliography(returnFocus: HTMLElement): void;
};

function preview(templates: ReferenceTemplates): string {
  return (["figure", "table", "equation"] as const).map(kind =>
    (templates[kind] ?? DEFAULT_REFERENCE_TEMPLATES[kind]).replace("%s", "1")).join(" · ");
}

/** UI only, outside document content. Expansion belongs to the owning tab, never storage. */
export const DocumentSettings = forwardRef<DocumentSettingsHandle, Props>(function DocumentSettings(props, ref) {
  useTranslation();
  const { expanded, onExpandedChange, readOnly, disabled, headingNumbering, referenceTemplates, bibliography } = props;
  const block = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const readonlySummary = useRef<HTMLParagraphElement>(null);
  const bodyId = useId();
  const captionId = useId();
  const statusId = useId();
  const style = referenceStyle(referenceTemplates);
  const styleLabel = i18n.t(style === "custom" ? "Custom" : REFERENCE_STYLES[style].label);
  const summary = [i18n.t(headingNumbering ? "Numbered headings" : "Unnumbered headings"),
    i18n.t("{{mode}} captions", {mode: i18n.t(props.numberingMode === "mixed" ? "Mixed" : props.numberingMode === "fixed" ? "Fixed" : "Automatic")}),
    i18n.t("{{style}} references", { style: styleLabel }), ...bibliography].join(" · ");
  useImperativeHandle(ref, () => ({ reveal() {
    if (!readOnly) onExpandedChange(true);
    const target = readOnly ? readonlySummary.current : trigger.current;
    block.current?.scrollIntoView({ block: "start" });
    target?.focus({ preventScroll: true });
  } }));
  const statusLabels = { draft: "Draft", review: "In review", approved: "Approved" } as const;
  const statusMark = props.status ? <span id={statusId}><Status tone={props.status === "approved" ? "ok" : props.status === "review" ? "warning" : "neutral"}
    label={i18n.t(statusLabels[props.status])} /></span> : null;
  const fields = <div className="display-settings">
    <SettingsSelect label={i18n.t("Status")} value={props.status ?? ""} disabled={disabled}
      options={[{value: "", label: i18n.t("None")}, ...DOCUMENT_STATUSES.map(value => ({value, label: i18n.t(statusLabels[value])}))]}
      onChange={value => props.onStatusChange(value ? value as DocumentStatus : null)} />
    <SettingsSwitch label={i18n.t("Number headings")} checked={headingNumbering} disabled={disabled} onChange={props.onToggleHeadingNumbering} />
    <SettingsRow label={<label htmlFor={captionId}>{i18n.t("Caption numbering")}</label>}>
      <Tooltip><TooltipTrigger render={<SelectControl id={captionId} value={props.numberingMode} disabled={disabled}
        aria-describedby={`${captionId}-hint`}
        options={[...(props.numberingMode === "mixed" ? [{value: "mixed", label: i18n.t("Mixed"), disabled: true}] : []),
          {value: "automatic", label: i18n.t("Automatic")}, {value: "fixed", label: i18n.t("Fixed")}]}
        onValueChange={value => props.onNumberingModeChange(value as "automatic" | "fixed")} />} />
        <TooltipContent>{i18n.t("Automatic and fixed numbers may be mixed intentionally, for example in appendices.")}</TooltipContent>
      </Tooltip>
      <span id={`${captionId}-hint`} className="sr-only">{i18n.t("Automatic and fixed numbers may be mixed intentionally, for example in appendices.")}</span>
    </SettingsRow>
    <SettingsSelect label={i18n.t("Reference style")} value={style} disabled={disabled}
      options={[...(style === "custom" ? [{value: "custom", label: `${i18n.t("Custom")} · ${preview(referenceTemplates ?? {})}`, disabled: true}] : []),
        ...Object.entries(REFERENCE_STYLES).map(([value, option]) => ({value, label: `${i18n.t(option.label)} · ${preview(option.templates)}`}))]}
      onChange={value => props.onReferenceStyleChange(value as ReferenceStyle)} />
    {bibliography.length > 0 ? <SettingsRow label={i18n.t("Bibliography")}>
      <span className="document-settings-bibliography" title={bibliography.join(" · ")}>{bibliography.map(file => file.split(/[\\/]/u).at(-1)).join(" · ")}</span>
      <Button variant="outline" disabled={disabled} aria-label={i18n.t("Connect bibliography…")} onClick={event => props.onConnectBibliography(event.currentTarget)}>{i18n.t("Connect")}</Button>
    </SettingsRow> : null}
  </div>;
  return <section ref={block} className="document-settings" aria-label={i18n.t("Document settings")}
    onKeyDown={event => {
      if (event.key === "Escape" && expanded && !event.defaultPrevented) {
        event.preventDefault(); event.stopPropagation(); onExpandedChange(false); trigger.current?.focus();
      }
    }}>
    {readOnly ? <p ref={readonlySummary} tabIndex={-1} className="document-settings-summary"><span>{i18n.t("Document settings")}</span>{statusMark}<span className="document-settings-values" title={summary}>{summary}</span></p> : <Button ref={trigger}
      variant="ghost" size="sm" className="document-settings-summary" aria-label={i18n.t("Document settings")}
      aria-describedby={props.status ? statusId : undefined} aria-expanded={expanded} aria-controls={bodyId} onClick={() => onExpandedChange(!expanded)}>
      {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
      <span>{i18n.t("Document settings")}</span>{statusMark}<span className="document-settings-values" title={summary}>{summary}</span>
    </Button>}
    {!readOnly ? <div id={bodyId} hidden={!expanded}>
      {fields}
    </div> : null}
  </section>;
});
