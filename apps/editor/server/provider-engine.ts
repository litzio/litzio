import type { AiProvider } from "../shared/assistant.ts";

/**
 * How a provider's connection speaks: the Codex app-server, or ACP through the Copilot CLI.
 * Protocol questions (resume, prompt, cancel, approvals, questions, skills, provider logs) branch on the engine;
 * whose models and account (catalog, account, usage, display) branch on the provider.
 */
export type ProviderEngine = "codex" | "acp";
const ENGINES: Record<AiProvider, ProviderEngine> = { codex: "codex", copilot: "acp" };
export const AI_PROVIDERS = Object.keys(ENGINES) as AiProvider[];
export function providerEngine(provider: AiProvider): ProviderEngine { return ENGINES[provider]; }
/** A conversation's provider; a stored record without one is Codex. */
export function conversationProvider(info: { provider?: AiProvider }): AiProvider { return info.provider ?? "codex"; }
