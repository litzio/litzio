import type { AiProvider } from "../shared/assistant.ts";
export { AI_PROVIDERS, providerEngine, providerCli, type ProviderEngine } from "../shared/assistant.ts";

/** A conversation's provider; a stored record without one is Codex. */
export function conversationProvider(info: { provider?: AiProvider }): AiProvider { return info.provider ?? "codex"; }
