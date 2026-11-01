/** Serializable work messages. Domain validation and freshness belong to the caller. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export const AI_TASK = {
  plugin: "ai-agent", service: "ai-task", route: "/api/ai-tasks",
  statusRoute: "/api/ai-agent-status", discoveryRoute: "/api/ai-task-service",
} as const;
export type AiTaskRequest = {
  id: string; caller: string; task: string; instruction: string;
  materials: { path: string; name: string }[];
  input: JsonValue; schema: Record<string, JsonValue>; baseline: string;
};
export type AiFailure = "provider" | "timeout" | "cancelled" | "format" | "uncertain";
export type AiTaskJob = {
  kind: "ai-task"; id: string; caller: string; task: string; baseline: string; startedAt: number; finishedAt?: number;
  state: "running" | "success" | "error" | "cancelled";
  result?: JsonValue; failure?: AiFailure; error?: string;
};
export type AiTaskRecord = { job: AiTaskJob; status: AiTaskJob["state"] | "uncertain"; canCancel: boolean };
export type AiAgentStatus = { adapter: string; available: boolean; loginRequired: boolean; message?: string };
export type AiTaskService = {
  status(): Promise<AiAgentStatus>;
  start(request: AiTaskRequest): Promise<AiTaskRecord>;
  current(id: string): AiTaskRecord | null;
  cancel(id: string): Promise<AiTaskRecord>;
};
/** Injected worker boundary. It adds no document or provider semantics to Host. */
export type AiTaskExecutor = {
  start(request: AiTaskRequest, timeoutMs: number): Promise<AiTaskRecord>;
  current(id: string): AiTaskRecord | null;
  cancel(id: string): Promise<AiTaskRecord>;
};
export type AiWorkerRequest = {
  type: "ai-task"; request: AiTaskRequest;
  materials: { path: string; name: string; sha256: string }[];
  temporary: { snapshot: string; control: string };
};
