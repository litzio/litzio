import type * as React from "react";
export type SettingsRowProps = { label: React.ReactNode; description?: React.ReactNode; children?: React.ReactNode; testId?: string };
export type SettingsSwitchProps = Omit<SettingsRowProps, "children"> & { checked: boolean; onChange(checked: boolean): void; disabled?: boolean; invalid?: boolean; describedBy?: string };
export type SettingsSelectProps = Omit<SettingsRowProps, "children"> & {
  value: string; options: { value: string; label: string; disabled?: boolean; lang?: string }[]; onChange(value: string): void; disabled?: boolean;
};
