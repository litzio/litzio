import { useId } from "react";
import type { SettingsRowProps, SettingsSwitchProps, SettingsSelectProps, SettingsInputProps, SettingsActionProps } from "./settings-types.ts";
import { Input } from "./input.tsx";
import { Button } from "./button.tsx";

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

export function SettingsInput({ value, onChange, onBlur, onEnter, disabled, invalid, describedBy, testId, ...row }: SettingsInputProps) {
  const id = useId();
  return <FieldRow {...row} id={id}><Input id={id} data-testid={testId} value={value} disabled={disabled} aria-invalid={invalid}
    aria-describedby={[row.description ? `${id}-description` : "", describedBy].filter(Boolean).join(" ") || undefined}
    onChange={event => onChange(event.target.value)} onBlur={onBlur}
    onKeyDown={event => { if (event.key === "Enter" && onEnter) { event.preventDefault(); onEnter(); } }} /></FieldRow>;
}

export function SettingsAction({ actionLabel, run, disabled, variant = "secondary", ...row }: SettingsActionProps) {
  return <SettingsRow {...row}><Button size="sm" variant={variant} disabled={disabled} onClick={run}>{actionLabel}</Button></SettingsRow>;
}
