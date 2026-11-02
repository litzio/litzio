import type { ConversionExecutor } from "./worker.ts";
import type { AiTaskExecutor, AiTaskService } from "./ai.ts";

/** Trusted Host operations. Hosts retain Root, native admission and publication checks. */
export type PluginHostContext = {
  features(): Record<string, boolean>;
  setFeatures(features: Record<string, boolean>): Record<string, boolean>;
  settingsFile: string;
  resolvePath(file: string, create?: boolean): string;
  documentPath(file: string): string;
  mediaPath(uri: string, document: string): string;
  readText(file: string): string;
  validateDocument(source: string): void;
  executor: ConversionExecutor;
  aiExecutor: AiTaskExecutor;
  /** Undefined while the providing plugin is disabled. Calls retain caller identity. */
  aiTasks(): AiTaskService | undefined;
  /** Retain the runtime's existing session OS lock before publishing pending work. */
  requestOwner(): string;
  /** Shared liveness probe; I/O errors are not proof of a dead owner. */
  isRequestOwnerAlive(owner: string): boolean;
  /** Plugin-owned transient data survives re-registration within this Host. */
  session: Map<string, unknown>;
};
export type HostPlugin = {
  aiTaskService?: AiTaskService;
  operations: Record<string, (args: any) => any>;
  routes: Record<string, Partial<Record<"GET" | "POST" | "PUT" | "DELETE", string>>>;
  /** May observe/cancel accepted work, or replay its UUID; never admit new work. */
  drainingOperations?: string[];
};
export type HostModule = { activate(host: PluginHostContext): HostPlugin };
