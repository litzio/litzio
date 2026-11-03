/** Serializable work messages. Domain validation and freshness belong to the caller. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export const AI_TASK = {
  plugin: "ai-agent", service: "ai-task", route: "/api/ai-tasks",
  settingsRoute: "/api/ai-agent-settings",
  statusRoute: "/api/ai-agent-status", discoveryRoute: "/api/ai-task-service",
} as const;
export type AiExecutionSettings = { model: string; reasoningEffort: string; responseLanguage?: AiResponseLanguage };
export const DEFAULT_AI_SETTINGS: AiExecutionSettings = { model: "gpt-6.1-sol", reasoningEffort: "medium" };
/** Fallback for tasks started without a conversation; never a conversation override. */
export type AiResponseLanguage = "ko" | "en" | "ja";
export type AiProvider = "codex" | "copilot";
export type AiAgentSettings = AiExecutionSettings & { provider: AiProvider; enabled: boolean; writeAccess: "opened-folders" | "read-only" | "full-access";
  /** Codex feature-task defaults retained while the assistant uses Copilot. */
  codexTaskSettings?: Pick<AiExecutionSettings, "model" | "reasoningEffort"> };
export const AI_AGENT = {
  skillsRoute: "/api/ai-agent-skills", modelsRoute: "/api/ai-agent-models", diagnosticsRoute: "/api/ai-agent-diagnostics", environmentRoute: "/api/ai-agent-environment",
  conversationsRoute: "/api/ai-agent-conversations",
} as const;
export type AiConversationInfo = { id: string; provider?: AiProvider; title: string; folders: string[]; createdAt: number; updatedAt: number };
export type AiSkill = { name: string; path: string; description: string };
export type AiSkills = { skills: AiSkill[]; errors: { path: string; message: string }[] };
export type AiFileReference = { path: string; name: string; kind: string };
export type AiConversationItem = { id: string; kind: "user" | "assistant" | "reasoning" | "tool" | "plan"; text: string; references?: AiFileReference[]; status?: string; toolResult?: { success: boolean | null; contentItems: { type: string; text?: string }[] } };
export type AiUserInput = { requestId: string | number; turnId: string; questions: {
  id: string; header: string; question: string; isOther: boolean; isSecret: boolean;
  options: { label: string; description: string }[] | null;
}[] };
export type AiUserInputAnswers = Record<string, { answers: string[] }>;
export type AiConversationTurn = { id: string; status: string; items: AiConversationItem[]; error?: string };
export type AiConversation = AiConversationInfo & { turns: AiConversationTurn[]; userInput?: AiUserInput; model: string; reasoningEffort: string;
  copilot?: AiCopilotOptions;
  tokenUsage?: { used: number; limit: number | null } };
export type AiConversationInput = Pick<AiExecutionSettings, "model" | "reasoningEffort"> & { id?: string; message: string; references?: string[]; skills?: { name: string; path: string }[];
  mode?: string;
  folders: string[]; document?: { path: string } };
export type AiModel = { id: string; model: string; displayName: string; description: string;
  supportedReasoningEfforts: { reasoningEffort: string; description: string }[]; defaultReasoningEffort: string };
export type AiCopilotOptions = { reasoningEfforts?: { reasoningEffort: string; description: string }[]; reasoningEffortSource: "config" | "cli"; modes: { id: string; name: string; description: string }[]; currentMode: string };
export type AiModels = { provider: AiProvider; models: AiModel[]; updatedAt: number; copilot?: AiCopilotOptions };
export type AiEnvironment = { cwd: string; instructions: string; skills: string[] };
export type AiDiagnostics = {
  provider: AiProvider; checkedAt: number; path: string | null; version: string | null; connected: boolean; error?: string;
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
