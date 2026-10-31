import type { ConversionExecutor } from "./worker.ts";

/** Trusted Host operations. Hosts retain Root, native admission and publication checks. */
export type PluginHostContext = {
  settingsFile: string;
  resolvePath(file: string, create?: boolean): string;
  documentPath(file: string): string;
  mediaPath(uri: string, document: string): string;
  readText(file: string): string;
  validateDocument(source: string): void;
  executor: ConversionExecutor;
  /** Plugin-owned transient data survives re-registration within this Host. */
  session: Map<string, unknown>;
};
export type HostPlugin = {
  operations: Record<string, (args: any) => any>;
  routes: Record<string, Partial<Record<"GET" | "POST" | "PUT" | "DELETE", string>>>;
  /** May observe/cancel accepted work, or replay its UUID; never admit new work. */
  drainingOperations?: string[];
};
export type HostModule = { activate(host: PluginHostContext): HostPlugin };
