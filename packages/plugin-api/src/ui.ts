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
/** Opaque editor revision; source is a Core-native applied snapshot, not disk access. */
export type BlockSelection = { token: string; source: string; index: number };
export type UiAction = { id: string; label: string; keywords?: string[]; run(returnFocus: HTMLElement | null): void | Promise<void> };
export type TabKind = {
  id: string; label: string; className?: string;
  open(resource: string): Promise<TabContent>;
  View: React.ComponentType<{ data: any }>;
  notices?(data: any): { id: string; severity: "warning" | "error"; message: string }[];
};
export type UiContributions = {
  commands: UiAction[]; sidebar: UiAction[]; tabs: TabKind[];
  /** Called once per activation after views unmount. Must release non-React resources. */
  dispose(): void;
};
export type UiHost = {
  api: number; React: typeof React; jsx: typeof Jsx;
  ReadingSurface: React.ComponentType<ReadingSurfaceProps>;
  Button: React.ComponentType<{ children?: React.ReactNode; onClick(): void; disabled?: boolean }>;
  text(key: string): string;
  /** GET-only, same-origin Host read surface; document Root checks remain Host-owned. */
  readJson<T>(route: string, query: Record<string, string>): Promise<T>;
  imageUrl(path: string, uri: string): string;
  pickFolder(options: { title: string; description: string; open(folder: string): Promise<string> }, returnFocus: HTMLElement | null): void;
  openTab(kind: string, resource: string): Promise<string>;
  /** The existing shell PDF picker/dialog. It does not implement plugin work. */
  showPdfConversion(returnFocus: HTMLElement | null): void;
  /** Experimental proposal spike. No editor-engine objects cross this boundary. */
  readSelection(): Promise<BlockSelection>;
  applyBlockProposal(selection: BlockSelection, markdown: string): void;
  requestProposal<T>(input: { id: string; source: string; index: number; instruction: string }): Promise<T>;
  SourceComparison: React.ComponentType<{ before: string; after: string }>;
};
export type UiModule = { activate(host: UiHost): UiContributions };
