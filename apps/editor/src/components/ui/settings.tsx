import { useId } from "react";
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

export function SettingsSelect({ value, options, onChange, disabled, testId, ...row }: SettingsSelectProps) {
  const id = useId();
  return <FieldRow {...row} id={id}><select id={id} className="form-select settings-select" data-testid={testId} value={value} disabled={disabled}
    aria-describedby={row.description ? `${id}-description` : undefined} onChange={event => onChange(event.target.value)}>
    {options.map(option => <option key={option.value} value={option.value} disabled={option.disabled} lang={option.lang}>{option.label}</option>)}
  </select></FieldRow>;
}
