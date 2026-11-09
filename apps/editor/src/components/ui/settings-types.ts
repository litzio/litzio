import type * as React from "react";
export type SettingsRowProps = { label: React.ReactNode; description?: React.ReactNode; children?: React.ReactNode; testId?: string };
export type SettingsSwitchProps = Omit<SettingsRowProps, "children"> & { checked: boolean; onChange(checked: boolean): void; disabled?: boolean; invalid?: boolean; describedBy?: string };
export type SettingsSelectProps = Omit<SettingsRowProps, "children"> & {
  value: string; options: { value: string; label: string; lang?: string }[]; onChange(value: string): void; disabled?: boolean;
};
export type SettingsInputProps = Omit<SettingsRowProps, "children"> & {
  value: string; onChange(value: string): void; onBlur?(): void; onEnter?(): void;
  disabled?: boolean; invalid?: boolean; describedBy?: string;
};
export type SettingsActionProps = Omit<SettingsRowProps, "children"> & { actionLabel: string; run(): void; disabled?: boolean; variant?: "default" | "secondary" };
export type UiMenuItem = { id: string; label: string; run(returnFocus: HTMLElement | null): void; disabled?: boolean; danger?: boolean; description?: string };
export type ActionMenuProps = { label: string; items: UiMenuItem[] };
