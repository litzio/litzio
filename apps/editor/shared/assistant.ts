/** Serializable work messages. Domain validation and freshness belong to the caller. */

export type AssistantExecutionSettings = { model: string; reasoningEffort: string; responseLanguage?: AssistantResponseLanguage };
export const DEFAULT_ASSISTANT_SETTINGS: AssistantExecutionSettings = { model: "gpt-6.1-sol", reasoningEffort: "medium" };
/** Fallback for tasks started without a conversation; never a conversation override. */
export type AssistantResponseLanguage = "ko" | "en" | "ja";
/** The one list of AI providers; input checks and choices read it. */
export const AI_PROVIDERS = ["codex", "copilot", "ollama"] as const;
export type AiProvider = typeof AI_PROVIDERS[number];
export function isAiProvider(value: unknown): value is AiProvider { return AI_PROVIDERS.includes(value as AiProvider); }
/**
 * How a provider's connection speaks: the Codex app-server, or ACP through the Copilot CLI (GitHub account or Ollama).
 * Protocol questions (resume, prompt, cancel, approvals, questions, skills, session modes, provider logs) branch on the engine;
 * whose models and account (catalog, account, usage, display) branch on the provider.
 */
export type ProviderEngine = "codex" | "acp";
const ENGINES: Record<AiProvider, ProviderEngine> = { codex: "codex", copilot: "acp", ollama: "acp" };
export function providerEngine(provider: AiProvider): ProviderEngine { return ENGINES[provider]; }
/** The executable a provider runs; CLI version checks and updates are per executable. */
export type ProviderCli = "codex" | "copilot";
export const PROVIDER_CLIS: readonly ProviderCli[] = ["codex", "copilot"];
export function providerCli(provider: AiProvider): ProviderCli { return providerEngine(provider) === "acp" ? "copilot" : "codex"; }
export type AssistantSettings = AssistantExecutionSettings & { provider: AiProvider; permissionMode: "opened-folders" | "read-only" | "full-access";
  /** Ollama provider: the Ollama server the Host reaches. */
  ollamaUrl?: string };
export const DEFAULT_OLLAMA_URL = "http://localhost:11434";
/** Host-relative base address; the Copilot provider path (/v1) is added at launch. */
export function checkedOllamaUrl(value: unknown): string {
  const invalid = () => new Error("AI ollamaUrl: expected an http:// or https:// address without credentials, query or fragment, such as http://localhost:11434.");
  if (typeof value !== "string" || /[\r\n\t\x00]/u.test(value)) throw invalid();
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw invalid(); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw invalid();
  return (url.origin + url.pathname).replace(/\/+$/u, "");
}
export const ASSISTANT = {
  settingsRoute: "/api/assistant/settings",
  skillsRoute: "/api/assistant/skills", modelsRoute: "/api/assistant/models", diagnosticsRoute: "/api/assistant/diagnostics", environmentRoute: "/api/assistant/environment",
  conversationsRoute: "/api/assistant/conversations", providerUpdateRoute: "/api/assistant/provider-update",
  conversationTitleLimit: 80,
} as const;
export type AssistantConversationInfo = { id: string; provider?: AiProvider; permissionMode?: AssistantSettings["permissionMode"]; permissionFallback?: boolean; title: string; folders: string[]; createdAt: number; updatedAt: number;
  /** Set while archived; history hides the conversation by default. Sending a message clears it. */
  archivedAt?: number };
export type AssistantSkill = { displayName?: string; name: string; path: string; description: string };
export type AssistantSkills = { skills: AssistantSkill[]; errors: { path: string; message: string }[] };
export type AssistantFileReference = { path: string; name: string; kind: string; pastedImage?: boolean; unavailable?: boolean };
export type AssistantConversationItem = { id: string; submissionId?: string; userMessageSource?: "host" | "provider-live" | "provider-history"; kind: "user" | "assistant" | "reasoning" | "tool" | "plan" | "question"; text: string; fileChanges?: string[]; work?: { kind: string; detail?: string; truncated?: boolean }; question?: AssistantQuestionRecord; questionAnswer?: { requestId: string | number; turnId: string; answers: AssistantUserInputAnswers }; references?: AssistantFileReference[]; status?: string; toolResult?: { success: boolean | null; contentItems: { type: string; text?: string }[] } };
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
  copilotUsage?: { cost?: { amount: number; currency: string }; prompt?: { totalTokens: number; inputTokens: number; outputTokens: number; thoughtTokens?: number | null; cachedReadTokens?: number | null; cachedWriteTokens?: number | null } };
  tokenUsage?: { used: number; limit: number | null } };
export type AssistantConversationInput = Pick<AssistantExecutionSettings, "model" | "reasoningEffort"> & { submissionId?: string; id?: string; message: string; references?: string[]; skills?: { name: string; path: string }[];
  /** Display identities only; checked against existing opened roots, never an access grant. */
  /** User-selected conversation overrides; never persisted as global defaults. */
  provider?: AiProvider; permissionMode?: AssistantSettings["permissionMode"];
  mode?: string;
  folders: string[]; document?: { path: string }; };
export type AiModel = { id: string; model: string; displayName: string; description: string; supportsVision?: boolean;
  supportedReasoningEfforts: { reasoningEffort: string; description: string }[]; defaultReasoningEffort: string };
export type AiCopilotOptions = { reasoningEfforts?: { reasoningEffort: string; description: string }[]; reasoningEffortSource: "config" | "cli"; modes: { id: string; name: string; description: string }[]; currentMode: string };
export type AiModels = { provider: AiProvider; models: AiModel[]; updatedAt: number; fullAccessAllowed?: boolean; copilot?: AiCopilotOptions };
export type AssistantEnvironment = { cwd: string; instructions: string; skills: string[] };
export type AssistantDiagnostics = {
  provider: AiProvider; checkedAt: number; path: string | null; version: string | null; connected: boolean; error?: string;
  /** Ollama provider: its address, installed model count (null when unreachable) and why it cannot be used. */
  ollama?: { url: string; models: number | null; unavailable?: "unreachable" | "no-models" | "cli-missing" };
  account?: { type: string; email?: string | null; planType?: string } | null;
  accountError?: string; rateLimitsError?: string; mcpError?: string;
  storePowerShellOnly?: boolean;
  rateLimits?: {
    name: string; windows: { usedPercent: number; windowDurationMins: number | null; resetsAt: number | null }[];
    planType?: string;
    individualLimit?: { limit: number | null; used: number | null; remainingPercent: number | null; resetsAt: number | null };
    credits?: { hasCredits: boolean; unlimited: boolean; balance: number | null };
    spendControlReached?: boolean;
  }[];
  mcp?: { name: string; status: string; authStatus: string }[];
} & ProviderVersion;
/** Installed CLI against its latest public release; a failed or late check is "unknown", never "current". */
export type ProviderVersion = { versionStatus?: "current" | "available" | "unknown"; latestVersion?: string; latestCheckedAt?: number;
  /** Why the CLI's own update command cannot run on this Host. */
  updateUnavailable?: "missing" | "unsupported" };
/** Daemon-memory state of a provider CLI's own update command; one run per executable at a time. */
export type ProviderUpdate = { provider: ProviderCli; status: "idle" | "running" | "succeeded" | "failed";
  startedAt?: number; finishedAt?: number; exitCode?: number | null; timedOut?: boolean; error?: string;
  /** Combined stdout and stderr in arrival order; only the last part is kept beyond the limit. */
  output: string; outputTruncated?: boolean;
  /** A turn was in progress: the running connection is kept and replaced at the next idle send. */
  deferred?: boolean };
/** Display-only subset of provider diagnostics; owned and cached by the target Host. */
export type AssistantAccountUsage = Pick<AssistantDiagnostics, "provider" | "checkedAt" | "account" | "accountError" | "rateLimits" | "rateLimitsError">;

export type ProviderLogFailure = { available: false; reason: "unknown" | "missing" | "denied" | "unverified" | "launch" };

/** Daemon-memory receipt; provider observation and RPC completion can arrive in either order. */
export type AssistantSubmission = { id: string; status: "pending" | "accepted" | "rejected" | "unknown"; conversationId?: string; itemId?: string; error?: string };
export type AssistantSubmissionResult = { submission: AssistantSubmission; conversation?: AssistantConversation };
