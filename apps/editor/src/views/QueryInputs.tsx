import { HintedInput } from "./HintedInput.tsx";
import type { HostClient } from "../host-client.ts";
import { i18n } from "../i18n.ts";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { OperationQueryView as QueryView } from "@litzio/core/views-v2";
import { Input } from "../components/ui/input.tsx";
import { Button } from "../components/ui/button.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "../components/ui/tooltip.tsx";
import { FieldError } from "../ui/primitives.tsx";
import { Info, X, CircleOff, ChevronDown, ChevronRight } from "lucide-react";
import { readableLabel } from "./view-label.ts";

type Property = { format?: string; const?: unknown; title?: string; description?: string; type?: string | string[]; enum?: (string | number | boolean | null)[]; minLength?: number; pattern?: string; maxLength?: number; minimum?: number; maximum?: number };
export type InputSchema = { properties?: Record<string, Property>; required?: string[] };
/** Bind scalar controls only. Core/Host own schema validation and all data processing. */
export function QueryInputs({ view, schema, errors, change, suggestions, hints, client, actions }: { actions?: ReactNode; client?: HostClient; hints?: Record<string, { operation: string; version: number }>; suggestions?: Record<string, { operation: string; version: number }>; view: QueryView; schema: InputSchema; errors: Record<string, string>; change(field: string, value: unknown, remove?: boolean): void }) {
  const prefix = useId();
  const container = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const fields = view.form?.fields ?? [];
  const secondary = fields.filter(field => field.advanced && !schema.required?.includes(field.field));
  const hasErrors = secondary.some(field => errors[field.field]);
  const open = expanded || hasErrors;
  useEffect(() => {
    if (hasErrors) setExpanded(true);
    if (Object.keys(errors).length) container.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors, hasErrors]);
  const summary = secondary.filter(field => Object.hasOwn(view.sources.stats.args, field.field) && view.sources.stats.args[field.field] !== undefined).map(field => {
    const value = view.sources.stats.args[field.field];
    return `${schema.properties?.[field.field]?.title ?? readableLabel(field.field)}: ${value === null ? i18n.t("No value") : value === "" ? '\"\"' : String(value)}`;
  }).join(" · ");
  const renderField = (field: typeof fields[number]) => {
    const p = schema.properties?.[field.field];
    if (!p) return null;
    const id = `${prefix}-${field.field}`, value = view.sources.stats.args[field.field];
    const label = p.title ?? readableLabel(field.field);
    const required = schema.required?.includes(field.field), nullable = Array.isArray(p.type) && p.type.includes("null");
    const emptyIsValue = field.component === "TextInput" && (p.const === "" || p.enum?.includes(""));
    const hasValue = value !== undefined && (value !== "" || emptyIsValue);
    const boolean = field.component === "Checkbox";
    const select = field.component === "Select" || boolean;
    const common = { id, "data-view-field": field.field, required: required && value === undefined, "aria-invalid": !!errors[field.field], "aria-describedby": errors[field.field] ? `${id}-error` : undefined };
    const description = [p.description, field.component === "DateInput" ? i18n.t("Date format: YYYY-MM-DD") : undefined].filter(Boolean).join(" ");
    const clear = i18n.t("Clear {{field}}", { field: label });
    return <div key={field.field} className="view-input"><div className="flex items-center gap-1"><label htmlFor={id}>{label}{required ? " *" : ""}</label>
      {description ? <Tooltip><TooltipTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={i18n.t("About {{field}}", { field: label })} />}><Info aria-hidden="true" /></TooltipTrigger><TooltipContent>{description}</TooltipContent></Tooltip> : null}
    </div>
      <div className="view-input-control">
      {select ? <select {...common} className="form-select settings-select" value={boolean ? value === undefined ? "any" : String(value) : value === undefined ? "" : String(p.enum?.findIndex(v => v === value))} onChange={e => {
        if (boolean) change(field.field, e.target.value === "null" ? null : e.target.value === "true", e.target.value === "any");
        else change(field.field, p.enum![Number(e.target.value)]);
      }}>
        {boolean ? <><option value="any" disabled={required}>{required ? i18n.t("Choose a value") : i18n.t("Any")}</option><option value="true">{i18n.t("Yes")}</option><option value="false">{i18n.t("No")}</option>{nullable ? <option value="null">{i18n.t("No value")}</option> : null}</> : <><option value="" disabled>{i18n.t("Choose a value")}</option>{p.enum?.map((v, i) => <option key={i} value={i}>{v === null ? i18n.t("No value") : typeof v === "string" ? readableLabel(v) : String(v)}</option>)}</>}
      </select>
      : field.component === "TextInput" && client && (suggestions?.[field.field] || hints?.[field.field]) ? <HintedInput {...common} client={client} suggestion={suggestions?.[field.field]} hint={hints?.[field.field]} value={typeof value === "string" ? value : ""} maxLength={Math.min(512, p.maxLength ?? 512)} className={!required && hasValue ? "pr-9" : undefined} onValueChange={text => change(field.field, text, text === "" && !required && !emptyIsValue)} />
      : <Input {...common} lang={i18n.language} className={!required && hasValue ? "pr-9" : undefined} type={field.component === "NumberInput" ? "number" : "text"} inputMode={field.component === "DateInput" ? "numeric" : undefined} pattern={field.component === "DateInput" ? "[0-9]{4}-[0-9]{2}-[0-9]{2}" : undefined} placeholder={value === null ? i18n.t("No value") : field.component === "DateInput" ? "YYYY-MM-DD" : undefined} value={value === undefined || value === null ? "" : String(value)} maxLength={Math.min(512, p.maxLength ?? 512)} min={p.minimum} max={p.maximum} step={(Array.isArray(p.type) ? p.type.includes("integer") : p.type === "integer") ? 1 : "any"} onChange={e => change(field.field, field.component === "NumberInput" ? e.target.value === "" ? undefined : e.target.valueAsNumber : e.target.value, e.target.value === "" && (!required && !emptyIsValue || field.component === "NumberInput"))} />}
      {!required && !boolean && hasValue ? <Tooltip><TooltipTrigger className={select ? "view-select-clear" : "view-input-clear"} render={<Button type="button" variant="ghost" size="icon-sm" aria-label={clear} onClick={() => { change(field.field, undefined, true); document.getElementById(id)?.focus(); }} />}><X aria-hidden="true" /></TooltipTrigger><TooltipContent>{clear}</TooltipContent></Tooltip> : null}
      </div>
      <FieldError id={`${id}-error`}>{errors[field.field]}</FieldError>
      {nullable && !select && value !== null ? <Tooltip><TooltipTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={i18n.t("No value for {{field}}", { field: label })} onClick={() => change(field.field, null)} />}><CircleOff aria-hidden="true" /></TooltipTrigger><TooltipContent>{i18n.t("No value")}</TooltipContent></Tooltip> : null}
    </div>;
  };
  return <div ref={container} className="view-query-inputs">
    {fields.filter(field => !secondary.includes(field)).map(renderField)}
    {secondary.length ? <>
      {open ? <div id={`${prefix}-advanced`} className="view-query-advanced">{secondary.map(renderField)}</div> : <div id={`${prefix}-advanced`} hidden />}
      {!open && summary ? <p className="view-query-summary">{summary}</p> : null}
    </> : null}
    {secondary.length || actions ? <div className="form-actions view-query-actions">
      {secondary.length ? <Button className="view-query-more" type="button" variant="ghost" size="sm" aria-expanded={open} aria-controls={`${prefix}-advanced`} onClick={() => setExpanded(!open)}>{open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}{i18n.t("Additional conditions")}</Button> : null}
      {actions}
    </div> : null}
  </div>;
}
