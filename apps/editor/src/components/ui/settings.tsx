import { type ComponentProps, useId } from "react";
import type { SettingsRowProps, SettingsSwitchProps, SettingsSelectProps } from "./settings-types.ts";

export function SettingsRow({ label, description, children, testId }: SettingsRowProps) {
  return <div className="settings-section settings-row" data-testid={testId}>
    <div className="settings-label"><h3 className="settings-heading">{label}</h3>{description ? <div className="settings-description">{description}</div> : null}</div>
    <div className="settings-row-control">{children}</div>
  </div>;
}

function FieldRow({ label, description, children, id, testId }: SettingsRowProps & { id: string }) {
  return <div className="settings-section settings-row">
    <div className="settings-label"><h3 className="settings-heading"><label htmlFor={id}>{label}</label></h3>{description ? <div id={`${id}-description`} className="settings-description">{description}</div> : null}</div>
    <div className="settings-row-control" data-testid={testId}>{children}</div>
  </div>;
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
