/** Serializable work messages. Domain validation and freshness belong to the caller. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type AssistantExecutionSettings = { model: string; reasoningEffort: string; responseLanguage?: AssistantResponseLanguage };
export const DEFAULT_ASSISTANT_SETTINGS: AssistantExecutionSettings = { model: "gpt-6.1-sol", reasoningEffort: "medium" };
/** Fallback for tasks started without a conversation; never a conversation override. */
export type AssistantResponseLanguage = "ko" | "en" | "ja";
export type AiProvider = "codex" | "copilot";
export type AssistantSettings = AssistantExecutionSettings & { provider: AiProvider; permissionMode: "opened-folders" | "read-only" | "full-access" };
export const ASSISTANT = {
  settingsRoute: "/api/assistant/settings",
  skillsRoute: "/api/assistant/skills", modelsRoute: "/api/assistant/models", diagnosticsRoute: "/api/assistant/diagnostics", environmentRoute: "/api/assistant/environment",
  conversationsRoute: "/api/assistant/conversations",
} as const;
export type AssistantConversationInfo = { id: string; provider?: AiProvider; permissionMode?: AssistantSettings["permissionMode"]; permissionFallback?: boolean; title: string; folders: string[]; createdAt: number; updatedAt: number };
export type AssistantSkill = { displayName?: string; name: string; path: string; description: string };
export type AssistantSkills = { skills: AssistantSkill[]; errors: { path: string; message: string }[] };
export type AssistantFileReference = { path: string; name: string; kind: string };
export type AssistantConversationItem = { id: string; submissionId?: string; userMessageSource?: "host" | "provider-live" | "provider-history"; kind: "user" | "assistant" | "reasoning" | "tool" | "plan" | "question"; text: string; question?: AssistantQuestionRecord; questionAnswer?: { requestId: string | number; turnId: string; answers: AssistantUserInputAnswers }; references?: AssistantFileReference[]; status?: string; toolResult?: { success: boolean | null; contentItems: { type: string; text?: string }[] } };
export type AssistantUserInput = { requestId: string | number; turnId: string; questions: {
  id: string; header: string; question: string; isOther: boolean; isSecret: boolean;
  options: { label: string; description: string }[] | null;
}[] };
export type AssistantUserInputAnswers = Record<string, { answers: string[] }>;
/** Conversation-owned interaction metadata. Provider message text remains provider-owned. */
export type AssistantQuestionRecord = AssistantUserInput & {
  approval?: boolean;
  delivery: "blocking" | "async";
  status: "pending" | "sending" | "answered" | "expired" | "unknown";
  sourceQuestions?: { title: string; options: string[] | null }[];
  answers?: AssistantUserInputAnswers;
  error?: string;
};
export type AssistantConversationTurn = { id: string; status: string; items: AssistantConversationItem[]; error?: string };
export type AssistantConversation = AssistantConversationInfo & { turns: AssistantConversationTurn[]; userInput?: AssistantUserInput; model: string; reasoningEffort: string;
  copilot?: AiCopilotOptions;
  tokenUsage?: { used: number; limit: number | null } };
export type AssistantConversationInput = Pick<AssistantExecutionSettings, "model" | "reasoningEffort"> & { submissionId?: string; id?: string; message: string; references?: string[]; skills?: { name: string; path: string }[];
  /** Display identities only; checked against existing opened roots, never an access grant. */
  /** User-selected conversation overrides; never persisted as global defaults. */
  provider?: AiProvider; permissionMode?: AssistantSettings["permissionMode"];
  mode?: string;
  folders: string[]; document?: { path: string }; reviewWorkspace?: {path:string} };
export type AiModel = { id: string; model: string; displayName: string; description: string;
  supportedReasoningEfforts: { reasoningEffort: string; description: string }[]; defaultReasoningEffort: string };
export type AiCopilotOptions = { reasoningEfforts?: { reasoningEffort: string; description: string }[]; reasoningEffortSource: "config" | "cli"; modes: { id: string; name: string; description: string }[]; currentMode: string };
export type AiModels = { provider: AiProvider; models: AiModel[]; updatedAt: number; fullAccessAllowed?: boolean; copilot?: AiCopilotOptions };
export type AssistantEnvironment = { cwd: string; instructions: string; skills: string[] };
export type AssistantDiagnostics = {
  provider: AiProvider; checkedAt: number; path: string | null; version: string | null; connected: boolean; error?: string;
  account?: { type: string; email?: string | null; planType?: string } | null;
  accountError?: string; rateLimitsError?: string; mcpError?: string;
  rateLimits?: {
    name: string; windows: { usedPercent: number; windowDurationMins: number | null; resetsAt: number | null }[];
    planType?: string;
    individualLimit?: { limit: number | null; used: number | null; remainingPercent: number | null; resetsAt: number | null };
    credits?: { hasCredits: boolean; unlimited: boolean; balance: number | null };
    spendControlReached?: boolean;
  }[];
  mcp?: { name: string; status: string; authStatus: string }[];
};
/** Display-only subset of provider diagnostics; owned and cached by the target Host. */
export type AssistantAccountUsage = Pick<AssistantDiagnostics, "provider" | "checkedAt" | "account" | "accountError" | "rateLimits" | "rateLimitsError">;

export type ProviderLogFailure = { available: false; reason: "unknown" | "missing" | "denied" | "unverified" | "launch" };

/** Daemon-memory receipt; provider observation and RPC completion can arrive in either order. */
export type AssistantSubmission = { id: string; status: "pending" | "accepted" | "rejected" | "unknown"; conversationId?: string; itemId?: string; turnFailed?: boolean; error?: string };
export type AssistantSubmissionResult = { submission: AssistantSubmission; conversation?: AssistantConversation };
