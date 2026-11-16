import { type ComponentProps, useId } from "react";
import type { SettingsRowProps, SettingsSwitchProps, SettingsSelectProps } from "./settings-types.ts";

export { Row as SettingsRow } from "./row.tsx";
import { Row } from "./row.tsx";

function FieldRow({ label, description, children, id, testId }: SettingsRowProps & { id: string }) {
  return <Row label={<label htmlFor={id}>{label}</label>} description={description ? <span id={`${id}-description`}>{description}</span> : undefined}>
    <div className="settings-field-control" data-testid={testId}>{children}</div>
  </Row>;
}

export function SettingsSwitch({ checked, onChange, disabled, invalid, describedBy, ...row }: SettingsSwitchProps) {
  const id = useId();
  return <FieldRow {...row} id={id}><input id={id} className="settings-switch" type="checkbox" role="switch" checked={checked} disabled={disabled}
    aria-invalid={invalid} aria-describedby={[row.description ? `${id}-description` : "", describedBy].filter(Boolean).join(" ") || undefined} onChange={event => onChange(event.target.checked)} /></FieldRow>;
}

/** Shared control; callers own label placement. */
export function SelectControl({ options, placeholder, onValueChange, ...props }: Omit<ComponentProps<"select">, "onChange"> & {
  options: SettingsSelectProps["options"]; placeholder?: string; onValueChange(value: string): void;
}) {
  return <select {...props} className="form-select settings-select" onChange={event => onValueChange(event.target.value)}>
    {placeholder !== undefined && <option value="" disabled>{placeholder}</option>}
    {options.map(option => <option key={option.value} value={option.value} disabled={option.disabled} lang={option.lang}>{option.label}</option>)}
  </select>;
}
export function SettingsSelect({ value, options, onChange, disabled, testId, ...row }: SettingsSelectProps) {
  const id = useId();
  return <FieldRow {...row} id={id}><SelectControl id={id} data-testid={testId} value={value} options={options} disabled={disabled}
    aria-describedby={row.description ? `${id}-description` : undefined} onValueChange={onChange} /></FieldRow>;
}

/** Shared progress semantics with a compositor-only value transition. */
export function SettingsProgress({ value, max = 1, ...props }: { value?: number; max?: number; "aria-label"?: string }) {
  const fraction = value === undefined ? undefined : Math.max(0, Math.min(1, value / max));
  if (fraction === undefined) return <progress className="settings-progress" role="progressbar" max={max} {...props} />;
  return <div className="settings-progress">
    <progress className="sr-only" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={fraction * max} max={max} value={fraction * max} {...props} />
    <span style={{ transform: `scaleX(${fraction})` }} />
  </div>;
}
