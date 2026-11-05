import { i18n } from "../i18n.ts";
import { useId } from "react";
import type { QueryView } from "@litzio/core/views-v2";
import { Input } from "../components/ui/input.tsx";
import { Button } from "../components/ui/button.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "../components/ui/tooltip.tsx";
import { FieldError } from "../ui/primitives.tsx";
import { Info, X, CircleOff } from "lucide-react";
import { readableLabel } from "./view-label.ts";

type Property = { title?: string; description?: string; type?: string | string[]; enum?: (string | number | boolean | null)[]; maxLength?: number; minimum?: number; maximum?: number };
export type InputSchema = { properties?: Record<string, Property>; required?: string[] };
/** Bind scalar controls only. Core/Host own schema validation and all data processing. */
export function QueryInputs({ view, schema, errors, change }: { view: QueryView; schema: InputSchema; errors: Record<string, string>; change(field: string, value: unknown, remove?: boolean): void }) {
  const prefix = useId();
  return <>{view.form?.fields.map(field => {
    const p = schema.properties?.[field.field];
    if (!p) return null;
    const id = `${prefix}-${field.field}`, value = view.sources.stats.args[field.field];
    const label = p.title ?? readableLabel(field.field);
    const required = schema.required?.includes(field.field), nullable = Array.isArray(p.type) && p.type.includes("null");
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
      : <Input {...common} lang={i18n.language} className={!required && value !== undefined && value !== "" ? "pr-9" : undefined} type={field.component === "NumberInput" ? "number" : "text"} inputMode={field.component === "DateInput" ? "numeric" : undefined} pattern={field.component === "DateInput" ? "[0-9]{4}-[0-9]{2}-[0-9]{2}" : undefined} placeholder={value === null ? i18n.t("No value") : field.component === "DateInput" ? "YYYY-MM-DD" : undefined} value={value === undefined || value === null ? "" : String(value)} maxLength={Math.min(512, p.maxLength ?? 512)} min={p.minimum} max={p.maximum} step={(Array.isArray(p.type) ? p.type.includes("integer") : p.type === "integer") ? 1 : "any"} onChange={e => change(field.field, field.component === "NumberInput" ? e.target.value === "" ? undefined : e.target.valueAsNumber : e.target.value, field.component === "NumberInput" && e.target.value === "")} />}
      {!required && !boolean && value !== undefined && value !== "" ? <Tooltip><TooltipTrigger className={select ? "view-select-clear" : "view-input-clear"} render={<Button type="button" variant="ghost" size="icon-sm" aria-label={clear} onClick={() => { change(field.field, undefined, true); document.getElementById(id)?.focus(); }} />}><X aria-hidden="true" /></TooltipTrigger><TooltipContent>{clear}</TooltipContent></Tooltip> : null}
      </div>
      <FieldError id={`${id}-error`}>{errors[field.field]}</FieldError>
      {nullable && !select && value !== null ? <Tooltip><TooltipTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={i18n.t("No value for {{field}}", { field: label })} onClick={() => change(field.field, null)} />}><CircleOff aria-hidden="true" /></TooltipTrigger><TooltipContent>{i18n.t("No value")}</TooltipContent></Tooltip> : null}
    </div>;
  })}</>;
}
