import { useEffect, useState } from "react";
import { observeAssistantProvider, type createAssistantRequest } from "../assistant-api.ts";
import { ASSISTANT, type AiModels, type AiProvider, type AssistantDiagnostics } from "../../shared/assistant.ts";
import { i18n } from "../i18n.ts";

type Request = ReturnType<typeof createAssistantRequest>;

/** Why Ollama cannot be used; another failure keeps the Host's own message. */
export function unavailableReason(diagnostics: AssistantDiagnostics) {
  const reason = diagnostics.ollama?.unavailable;
  return reason ? i18n.t(reason === "unreachable" ? "Ollama is unreachable. Check the address and that Ollama is running." : reason === "no-models" ? "No models are installed in Ollama." : "Copilot CLI is not installed. Ollama runs through the Copilot CLI.") : diagnostics.error ?? "";
}
export function providerIssue(status: AssistantDiagnostics) {
  if (status.provider === "ollama" && !status.connected) return unavailableReason(status) || "Ollama is unreachable. Check the address and that Ollama is running.";
  if (!status.connected) return status.error ?? (status.provider === "copilot" ? "GitHub Copilot is unavailable on the Host." : "Codex CLI is unavailable on the Host.");
  if (status.provider === "codex" && !status.account) return "Sign in to Codex to start a conversation.";
  return "";
}

/**
 * Model list and diagnostics of the chosen provider while the panel is open and set up.
 * Each is read from the cache and then revalidated; a reply for an earlier provider, read revision or opening is dropped.
 */
export function useAssistantProviderOptions({ request, open, ready, provider, providerReadRevision, setProblem, onModels }: {
  request: Request; open: boolean; ready: boolean; provider: AiProvider; providerReadRevision: number;
  setProblem(message: string): void; onModels(value: AiModels): void;
}) {
  const [catalog, setModels] = useState<AiModels>();
  const [providerProblem, setProviderProblem] = useState("");
  const models = catalog?.provider === provider ? catalog : undefined;
  useEffect(() => {
    if (!open || !ready) return;
    let alive = true;
    void observeAssistantProvider(request<AiModels>, ASSISTANT.modelsRoute, provider, value => {
      if (!alive) return;
      setModels(value);
      onModels(value);
    }).catch(error => { if (alive) setProblem(error.message); });
    void observeAssistantProvider(request<AssistantDiagnostics>, ASSISTANT.diagnosticsRoute, provider, value => {
      if (!alive) return;
      setProviderProblem(providerIssue(value));
    }).catch(error => { if (alive) setProviderProblem(error.message); });
    return () => { alive = false; };
  }, [open, ready, provider, providerReadRevision]);
  const clearProviderProblem = () => setProviderProblem("");
  return { models, setModels, providerProblem, clearProviderProblem };
}
