import { i18n } from "../i18n.ts";
import { useId } from "react";
import type { QueryView } from "@litzio/core/views-v2";
import { Input } from "../components/ui/input.tsx";
import { Button } from "../components/ui/button.tsx";
import { FieldError } from "../ui/primitives.tsx";

type Property = { title?: string; description?: string; type?: string | string[]; enum?: (string | number | boolean | null)[]; maxLength?: number; minimum?: number; maximum?: number };
export type InputSchema = { properties?: Record<string, Property>; required?: string[] };
/** Bind scalar controls only. Core/Host own schema validation and all data processing. */
export function QueryInputs({ view, schema, errors, change }: { view: QueryView; schema: InputSchema; errors: Record<string, string>; change(field: string, value: unknown, remove?: boolean): void }) {
  const prefix = useId();
  return <>{view.form?.fields.map(field => {
    const p = schema.properties?.[field.field];
    if (!p) return null;
    const id = `${prefix}-${field.field}`, value = view.sources.stats.args[field.field];
    const nullable = Array.isArray(p.type) && p.type.includes("null");
    const common = { id, "data-view-field": field.field, required: field.component !== "Checkbox" && schema.required?.includes(field.field) && value === undefined, "aria-invalid": !!errors[field.field], "aria-describedby": `${id}-help ${id}-error` };
    return <div key={field.field} className="view-input"><label htmlFor={id}>{p.title ?? field.field}{schema.required?.includes(field.field) ? " *" : ""}</label>
      {field.component === "Select" ? <select {...common} className="form-select settings-select" value={value === undefined ? "" : String(p.enum?.findIndex(v => v === value))} onChange={e => change(field.field, p.enum![Number(e.target.value)])}>
        <option value="" disabled>{i18n.t("Choose a value")}</option>{p.enum?.map((v, i) => <option key={i} value={i}>{v === null ? i18n.t("No value") : String(v)}</option>)}
      </select> : field.component === "Checkbox" ? <input {...common} className="settings-switch" type="checkbox" checked={value === true} onChange={e => change(field.field, e.target.checked)} />
      : <Input {...common} type={field.component === "DateInput" ? "date" : field.component === "NumberInput" ? "number" : "text"} value={value === undefined || value === null ? "" : String(value)} maxLength={Math.min(512, p.maxLength ?? 512)} min={p.minimum} max={p.maximum} step={(Array.isArray(p.type) ? p.type.includes("integer") : p.type === "integer") ? 1 : "any"} onChange={e => change(field.field, field.component === "NumberInput" ? e.target.value === "" ? undefined : e.target.valueAsNumber : e.target.value, field.component === "NumberInput" && e.target.value === "")} />}
      <span id={`${id}-help`}>{p.description}{value === undefined ? ` ${i18n.t("Unset")}` : value === null ? ` ${i18n.t("No value")}` : ""}</span>
      <FieldError id={`${id}-error`}>{errors[field.field]}</FieldError>
      <div className="view-controls">{!schema.required?.includes(field.field) ? <Button type="button" variant="ghost" size="sm" onClick={() => change(field.field, undefined, true)}>{i18n.t("Clear {{field}}", { field: p.title ?? field.field })}</Button> : null}
      {nullable ? <Button type="button" variant="ghost" size="sm" onClick={() => change(field.field, null)}>{i18n.t("No value")}</Button> : null}</div>
    </div>;
  })}</>;
}
