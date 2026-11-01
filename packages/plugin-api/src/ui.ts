import type * as React from "react";
import type * as Jsx from "react/jsx-runtime";
import type { EditableDocument } from "@litzio/core";

export type DocumentPosition = { blocks: { key: string; top: number; left: number; height: number }[]; height: number };
export type ReadingSurfaceProps = {
  document: EditableDocument; path: string;
  onLayout(position: DocumentPosition): void;
  onSelection(key: string | undefined): void;
};
export type TabContent = { path: string; data: unknown };
export type UiAction = { id: string; label: string; keywords?: string[]; run(returnFocus: HTMLElement | null): void | Promise<void> };
export type UiFileAction = { id: string; label: string; extensions: string[]; run(path: string, returnFocus: HTMLElement | null): void | Promise<void> };
export type SettingsSection = { id: string; label: string; description: string; View: React.ComponentType };
export type UiNotice = { id: string; message: string; severity: "error" | "warning" | "info"; reveal?(): void };
export type PluginDialogProps = { open: boolean; onClose(): void; title: string; description: string;
  returnFocus: React.RefObject<HTMLElement | null>; children?: React.ReactNode; footer?: React.ReactNode; testId?: string };
export type TabKind = {
  id: string; label: string; className?: string;
  open(resource: string): Promise<TabContent>;
  View: React.ComponentType<{ data: any }>;
  notices?(data: any): { id: string; severity: "warning" | "error"; message: string }[];
};
export type UiContributions = {
  commands: UiAction[]; sidebar: UiAction[]; tabs: TabKind[];
  settings?: SettingsSection[];
  fileActions?: UiFileAction[];
  /** Mounted once per activation, including while no plugin tab is open. */
  View?: React.ComponentType;
  /** Called once per activation after views unmount. Must release non-React resources. */
  dispose(): void;
};
export type UiHost = {
  features?: Readonly<Record<string, boolean>>;
  openSettings(section: string, returnFocus: HTMLElement | null): void;
  openDocument(path: string): Promise<void>;
  openFolder(path: string): Promise<string>;
  api: number; React: typeof React; jsx: typeof Jsx;
  ReadingSurface: React.ComponentType<ReadingSurfaceProps>;
  Button: React.ComponentType<{ children?: React.ReactNode; onClick(): void; disabled?: boolean; variant?: "ghost" | "secondary" | "default"; size?: "sm" | "default" }>;
  Input: React.ComponentType<React.InputHTMLAttributes<HTMLInputElement>>;
  Dialog: React.ComponentType<PluginDialogProps>;
  text(key: string, values?: Record<string, string | number>): string;
  openExternalLink(url: string): void;
  /** GET-only, same-origin Host read surface; document Root checks remain Host-owned. */
  readJson<T>(route: string, query: Record<string, string>): Promise<T>;
  requestJson<T>(route: string, method: string, body?: unknown): Promise<T>;
  /** Snapshot observed running during this activation's asset load, if any. */
  initialJob?: unknown;
  initialJobRead?: Promise<unknown>;
  setBusy(busy: boolean): void;
  notify(notice: UiNotice | null): void;
  imageUrl(path: string, uri: string): string;
  pickFolder(options: { title: string; description: string; open(folder: string): Promise<string> }, returnFocus: HTMLElement | null): void;
  openTab(kind: string, resource: string, current?: () => boolean): Promise<string>;
  pickFile(options: { title: string; description: string; choose: "pdf"; open(path: string): Promise<string> }, returnFocus: HTMLElement | null): void;
};
export type UiModule = { activate(host: UiHost): UiContributions };
