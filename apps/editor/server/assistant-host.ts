import { hostPaths, type HostRun } from "./host-paths.ts";
import { type FileAccess, LOCAL_FILE_ACCESS } from "./file-access.ts";
import { ASSISTANT, type AiProvider } from "../shared/assistant.ts";
import { createAssistantSettings, checkedAssistantSettings } from "./assistant-settings.ts";
import { ProviderConnections } from "./provider-connections.ts";
import { AssistantConversations } from "./assistant-conversations.ts";

/** Official daemon feature. Connections and turns live until daemon shutdown. */
export function createAssistantHost(access: FileAccess = LOCAL_FILE_ACCESS, settingsFile?: string, options?: { agent?: ProviderConnections; run?: HostRun }) {
  const paths = hostPaths(options?.run, { ...process.env });
  const { settings, configure } = createAssistantSettings(settingsFile ?? paths.settingsFile("assistant"), paths.assistantDefaults);
  let closed = false, closing: Promise<void> | undefined;
  let agent = options?.agent;
  let conversations: AssistantConversations | undefined;
  const history = () => conversations ??= new AssistantConversations(agent ??= new ProviderConnections(paths.assistant, undefined, undefined, options?.run), access);
  const provider = (args?: { provider?: AiProvider }): AiProvider => {
    const value = args?.provider ?? settings().provider;
    if (value !== "codex" && value !== "copilot") throw new Error("Invalid AI provider.");
    return value;
  };
  const assistantOperations = {
    assistantSkills: (args?: { provider?: AiProvider }) => {
      if (provider(args) !== "codex") throw new Error("Skill selection is available only with Codex.");
      return (agent ??= new ProviderConnections(paths.assistant, undefined, undefined, options?.run)).skills();
    },
    assistantModels: (args?: { provider?: AiProvider }) => (agent ??= new ProviderConnections(paths.assistant, undefined, undefined, options?.run)).models(provider(args)),
    assistantDiagnostics: (args?: { provider?: AiProvider }) => (agent ??= new ProviderConnections(paths.assistant, undefined, undefined, options?.run)).diagnostics(provider(args)),
    assistantEnvironment: () => (agent ??= new ProviderConnections(paths.assistant, undefined, undefined, options?.run)).environment(),
    assistantConversations: (args: any) => {
      if (!args.id) return history().list().filter(info => (info.provider ?? "codex") === provider(args));
      const conversation = history().current(args.id);
      return { ...conversation, displayRequest: history().display.snapshot(args.id, args.displayClient) };
    },
    assistantConversation: async (args: any) => {
      const currentSettings = settings();
      if (args.action === "display-result") { history().display.reply(args.id, args.displayClient, args.requestId, args.reply); return { acknowledged: true }; }
      if (args.action === "display-undo") return history().display.undo(args.id, args.displayClient, args.requestId);
      if (args.action === "resume") return history().resume(args.id, currentSettings);
      if (args.action === "send") {
        const existing = args.id ? history().current(args.id) : undefined;
        // Steering and cancellation retain their admitted turn and connection.
        if (!existing?.turns.some(turn => turn.status === "inProgress")) {
          const selected = provider({ provider: existing?.provider ?? args.provider ?? currentSettings.provider });
          const status = await assistantOperations.assistantDiagnostics({ provider: selected });
          if (!status.connected || selected === "codex" && !status.account) throw new Error(`AI provider ${selected} is unavailable: ${status.error ?? status.accountError ?? "Sign in on the Host."}`);
          if (closed) throw new Error("The Assistant Host is closing.");
        }
        return history().send(args, currentSettings, args.displayClient);
      }
      if (args.action === "answer") return history().answer(args.id, args.turnId, args.requestId, args.answers);
      if (args.action === "interrupt") return history().interrupt(args.id);
      throw new Error("Unknown conversation action.");
    },
  };
  const invoke = async (operation: string, args: any = {}): Promise<any> => {
    if (closed) throw new Error("The Assistant Host is closing.");
    if (operation === "settings") return settings();
    if (operation === "configure") {
      const current = settings(), next = checkedAssistantSettings(args);
      const selected = provider(next);
      if (selected !== current.provider || next?.model !== current.model || next?.reasoningEffort !== current.reasoningEffort) {
        const catalog = await assistantOperations.assistantModels({ provider: selected });
        const model = catalog.models.find(model => model.model === next.model);
        if (!model) throw new Error(`AI model: allowed values for ${selected}: ${catalog.models.map(model => model.model).join(", ") || "none available"}.`);
        if (!model.supportedReasoningEfforts.some(effort => effort.reasoningEffort === next.reasoningEffort)) throw new Error(`AI reasoningEffort: allowed values for ${next.model}: ${model.supportedReasoningEfforts.map(effort => effort.reasoningEffort).join(", ") || "none available"}.`);
      }
      if (closed) throw new Error("The Assistant Host is closing.");
      return configure(next);
    }
    if (!Object.hasOwn(assistantOperations, operation)) throw new Error("Unknown assistant operation.");
    return assistantOperations[operation as keyof typeof assistantOperations](args);
  };
  const route = (url: string): Record<string, string> | undefined => {
    if (url === ASSISTANT.settingsRoute) return { GET: "settings", PUT: "configure" };
    if (url === ASSISTANT.conversationsRoute) return { GET: "assistantConversations", POST: "assistantConversation" };
    const operation = { [ASSISTANT.skillsRoute]: "assistantSkills", [ASSISTANT.modelsRoute]: "assistantModels", [ASSISTANT.diagnosticsRoute]: "assistantDiagnostics", [ASSISTANT.environmentRoute]: "assistantEnvironment" }[url];
    return operation ? { GET: operation } : undefined;
  };
  const close = () => {
    closed = true;
    conversations?.display.cancel();
    return closing ??= Promise.resolve(agent?.close());
  };
  return { invoke, route, close };
}
