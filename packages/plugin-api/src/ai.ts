/** Serializable work messages. Domain validation and freshness belong to the caller. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export const AI_TASK = {
  plugin: "ai-agent", service: "ai-task", route: "/api/ai-tasks",
  settingsRoute: "/api/ai-agent-settings",
  statusRoute: "/api/ai-agent-status", discoveryRoute: "/api/ai-task-service",
} as const;
export type AiExecutionSettings = { model: string; reasoningEffort: string };
export const DEFAULT_AI_SETTINGS: AiExecutionSettings = { model: "gpt-6.1-sol", reasoningEffort: "medium" };
/** Main-agent settings share the execution defaults with feature tasks. */
export type AiResponseLanguage = "ko" | "en" | "ja" | "document";
export type AiAgentSettings = AiExecutionSettings & { provider: "codex"; enabled: boolean; writeAccess: "opened-folders" | "read-only"; responseLanguage?: AiResponseLanguage };
export const AI_AGENT = {
  modelsRoute: "/api/ai-agent-models", diagnosticsRoute: "/api/ai-agent-diagnostics", environmentRoute: "/api/ai-agent-environment",
  conversationsRoute: "/api/ai-agent-conversations",
} as const;
export type AiConversationInfo = { id: string; title: string; folders: string[]; createdAt: number; updatedAt: number };
export type AiConversationItem = { id: string; kind: "user" | "assistant" | "reasoning" | "tool" | "plan"; text: string; status?: string; toolResult?: { success: boolean | null; contentItems: { type: string; text?: string }[] } };
export type AiUserInput = { requestId: string | number; turnId: string; questions: {
  id: string; header: string; question: string; isOther: boolean; isSecret: boolean;
  options: { label: string; description: string }[] | null;
}[] };
export type AiUserInputAnswers = Record<string, { answers: string[] }>;
export type AiConversationTurn = { id: string; status: string; items: AiConversationItem[]; error?: string };
export type AiConversation = AiConversationInfo & { turns: AiConversationTurn[]; userInput?: AiUserInput; model: string; reasoningEffort: string; responseLanguage: AiResponseLanguage;
  tokenUsage?: { used: number; limit: number | null } };
export type AiConversationInput = AiExecutionSettings & { id?: string; message: string; responseLanguage: AiResponseLanguage;
  folders: string[]; document?: { path: string; source: string } };
export type AiModel = { id: string; model: string; displayName: string; description: string;
  supportedReasoningEfforts: { reasoningEffort: string; description: string }[]; defaultReasoningEffort: string };
export type AiModels = { provider: "codex"; models: AiModel[]; updatedAt: number };
export type AiEnvironment = { cwd: string; instructions: string; skills: string[] };
export type AiDiagnostics = {
  provider: "codex"; checkedAt: number; path: string | null; version: string | null; connected: boolean; error?: string;
  account?: { type: string; email?: string | null; planType?: string } | null;
  accountError?: string; rateLimitsError?: string; mcpError?: string;
  rateLimits?: { name: string; windows: { usedPercent: number; windowDurationMins: number | null; resetsAt: number | null }[] }[];
  mcp?: { name: string; status: string; authStatus: string }[];
};
export type AiTaskRequest = {
  id: string; caller: string; task: string; instruction: string;
  materials: { path: string; name: string }[];
  input: JsonValue; schema: Record<string, JsonValue>; baseline: string;
};
export type AiFailure = "provider" | "timeout" | "cancelled" | "format" | "uncertain";
export type AiTaskJob = {
  kind: "ai-task"; id: string; caller: string; task: string; baseline: string; startedAt: number; finishedAt?: number;
  state: "running" | "success" | "error" | "cancelled";
  execution: AiExecutionSettings; durationMs?: number;
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
  start(request: AiTaskRequest, timeoutMs: number, execution: AiExecutionSettings): Promise<AiTaskRecord>;
  current(id: string): AiTaskRecord | null;
  cancel(id: string): Promise<AiTaskRecord>;
};
export type AiWorkerRequest = {
  type: "ai-task"; request: AiTaskRequest; execution: AiExecutionSettings;
  materials: { path: string; name: string; sha256: string }[];
  temporary: { snapshot: string; control: string };
};
