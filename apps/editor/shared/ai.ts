/** Serializable work messages. Domain validation and freshness belong to the caller. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type AiExecutionSettings = { model: string; reasoningEffort: string; responseLanguage?: AiResponseLanguage };
export const DEFAULT_AI_SETTINGS: AiExecutionSettings = { model: "gpt-6.1-sol", reasoningEffort: "medium" };
/** Fallback for tasks started without a conversation; never a conversation override. */
export type AiResponseLanguage = "ko" | "en" | "ja";
export type AiProvider = "codex" | "copilot";
export type AiAgentSettings = AiExecutionSettings & { provider: AiProvider; writeAccess: "opened-folders" | "read-only" | "full-access" };
export const AI_AGENT = {
  settingsRoute: "/api/ai-agent-settings",
  skillsRoute: "/api/ai-agent-skills", modelsRoute: "/api/ai-agent-models", diagnosticsRoute: "/api/ai-agent-diagnostics", environmentRoute: "/api/ai-agent-environment",
  conversationsRoute: "/api/ai-agent-conversations",
} as const;
export type AiConversationInfo = { id: string; provider?: AiProvider; writeAccess?: AiAgentSettings["writeAccess"]; title: string; folders: string[]; createdAt: number; updatedAt: number };
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
  /** User-selected conversation overrides; never persisted as global defaults. */
  provider?: AiProvider; writeAccess?: AiAgentSettings["writeAccess"];
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
