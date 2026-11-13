import type { IncomingMessage, ServerResponse } from "node:http";
import { ASSISTANT_TRANSPORT_LIMITS } from "../shared/assistant-limits.ts";
import type { PluginService } from "./plugin-service.ts";
import { hostPaths, type HostRun } from "./host-paths.ts";
import { type FileAccess, LOCAL_FILE_ACCESS } from "./file-access.ts";
import { ASSISTANT, type AiProvider } from "../shared/assistant.ts";
import { createAssistantSettings, checkedAssistantSettings } from "./assistant-settings.ts";
import { ProviderConnections } from "./provider-connections.ts";
import { AssistantConversations, conversationForDisplay } from "./assistant-conversations.ts";

/** Official daemon feature. Connections and turns live until daemon shutdown. */
export function createAssistantHost(access: FileAccess = LOCAL_FILE_ACCESS, settingsFile?: string, options?: { agent?: ProviderConnections; run?: HostRun; plugins?: PluginService; paths?: ReturnType<typeof hostPaths> }) {
  const paths = options?.paths ?? hostPaths(options?.run, { ...process.env });
  const { settings, configure } = createAssistantSettings(settingsFile ?? paths.settingsFile("assistant"), paths.assistantDefaults);
  const plugins = options?.plugins;
  let closed = false, closing: Promise<void> | undefined;
  let agent = options?.agent;
  let conversations: AssistantConversations | undefined;
  const history = () => conversations ??= new AssistantConversations(agent ??= new ProviderConnections(paths.assistant, undefined, undefined, options?.run), access, plugins?.host);
  const provider = (args?: { provider?: AiProvider }): AiProvider => {
    const value = args?.provider ?? settings().provider;
    if (value !== "codex" && value !== "copilot") throw new Error("Invalid AI provider.");
    return value;
  };
  const assistantOperations = {
    assistantSkills: async (args?: { provider?: AiProvider }) => {
      if (provider(args) !== "codex") throw new Error("Skill selection is available only with Codex.");
      await plugins?.start();
      const catalog = await (agent ??= new ProviderConnections(paths.assistant, undefined, undefined, options?.run)).skills();
      return { ...catalog, skills: catalog.skills.map(skill => {
        const displayName = plugins?.host.skillDisplayName(skill.path);
        return displayName ? { ...skill, displayName } : skill;
      }) };
    },
    assistantModels: (args?: { provider?: AiProvider }) => (agent ??= new ProviderConnections(paths.assistant, undefined, undefined, options?.run)).models(provider(args)),
    assistantDiagnostics: async (args?: { provider?: AiProvider; summary?: string }) => {
      const selected = provider(args);
      const connection = agent ??= new ProviderConnections(paths.assistant, undefined, undefined, options?.run);
      if (args?.summary !== "account-usage") return connection.diagnostics(selected);
      if (selected !== "codex") return { provider: selected, checkedAt: Date.now() };
      const value = await connection.accountUsage();
      return { ...value, accountError: value.accountError ? "Unavailable" : undefined, rateLimitsError: value.rateLimitsError ? "Unavailable" : undefined };
    },
    assistantEnvironment: () => (agent ??= new ProviderConnections(paths.assistant, undefined, undefined, options?.run)).environment(),
    assistantConversations: (args: any) => {
      if (args.submissionId) return history().submission(args.submissionId);
      if (!args.id) return history().list().filter(info => (info.provider ?? "codex") === provider(args)).map(({ attachments: _attachments, ...info }) => info);
      const conversation = history().current(args.id);
      return { ...conversation, screenActionRequest: history().screenActions.snapshot(args.id, args.displayClient), screenRequest: history().screen.snapshot(args.id, args.displayClient), displayRequest: history().display.snapshot(args.id, args.displayClient) };
    },
    assistantConversation: async (args: any): Promise<any> => {
      if (args.action === "upload-image") {
        if (args.id) history().current(args.id);
        return history().attachments.upload(args);
      }
      if (args.action === "delete") {
        history().remove(args.id);
        return { id: args.id, outcome: "deleted" };
      }
      if (args.action === "provider-log" && Object.keys(args).every(key => ["action", "id", "provider"].includes(key))) return history().providerLog(args.id, args.provider);
      if (args.action === "send" && args.submissionId !== undefined) return history().submit(args, () => sendConversation(args));
      return sendConversation(args);
    },
  };
  const sendConversation = async (args: any): Promise<any> => {
      if (args.action === "send") await plugins?.start();
      if (closed) throw new Error("The Assistant Host is closing.");
      const currentSettings = settings();
      if (["screen-ack", "screen-action-ack", "display-ack"].includes(args.action)) {
        const requests = args.action === "screen-ack" ? history().screen : args.action === "screen-action-ack" ? history().screenActions : history().display;
        requests.acknowledge(args.id, args.displayClient, args.requestId);
        return { acknowledged: true };
      }
      if (args.action === "screen-action-result") { history().screenActions.reply(args.id, args.displayClient, args.requestId, args.reply); return { acknowledged: true }; }
      if (args.action === "screen-result") { history().screen.reply(args.id, args.displayClient, args.requestId, args.reply); return { acknowledged: true }; }
      if (args.action === "display-result") { history().display.reply(args.id, args.displayClient, args.requestId, args.reply); return { acknowledged: true }; }
      if (args.action === "file-change-compare" || args.action === "file-change-undo") return history().fileChange(args.id, args.turnId, args.path, args.action === "file-change-undo", args.folders ?? []);
      if (args.action === "display-undo") return history().display.undo(args.id, args.displayClient, args.requestId);
      if (args.action === "resume") return history().resume(args.id, currentSettings);
      if (args.action === "send") {
        const existing = args.id ? history().current(args.id) : undefined;
        // Steering and cancellation retain their admitted turn and connection.
        if (!existing?.turns.some(turn => turn.status === "inProgress")) {
          const selected = provider({ provider: existing?.provider ?? args.provider ?? currentSettings.provider });
          const status = await (agent ??= new ProviderConnections(paths.assistant, undefined, undefined, options?.run)).diagnostics(selected);
          if (!status.connected || selected === "codex" && !status.account) throw new Error(`AI provider ${selected} is unavailable: ${status.error ?? status.accountError ?? "Sign in on the Host."}`);
          if (closed) throw new Error("The Assistant Host is closing.");
        }
        return history().send(args, currentSettings, args.displayClient );
      }
      if (args.action === "answer") return history().answer(args.id, args.turnId, args.requestId, args.answers, args.displayClient);
      if (args.action === "interrupt") return history().interrupt(args.id);
      throw new Error("Unknown conversation action.");
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
      if (selected !== current.provider) conversations?.expireProviderQuestions(current.provider);
      return configure(next);
    }
    if (!Object.hasOwn(assistantOperations, operation)) throw new Error("Unknown assistant operation.");
    let result:any = await assistantOperations[operation as keyof typeof assistantOperations](args);
    if(result?.turns)result=conversationForDisplay(result);
    else if(result?.conversation)result={...result,conversation:conversationForDisplay(result.conversation)};
    if (Buffer.byteLength(JSON.stringify(result), "utf8") > ASSISTANT_TRANSPORT_LIMITS.responseBytes) throw new Error("Assistant response exceeds byte limit.");
    return result;
  };
  const route = (url: string): Record<string, string> | undefined => {
    if (url === ASSISTANT.settingsRoute) return { GET: "settings", PUT: "configure" };
    if (url === ASSISTANT.conversationsRoute) return { GET: "assistantConversations", POST: "assistantConversation" };
    const operation = { [ASSISTANT.skillsRoute]: "assistantSkills", [ASSISTANT.modelsRoute]: "assistantModels", [ASSISTANT.diagnosticsRoute]: "assistantDiagnostics", [ASSISTANT.environmentRoute]: "assistantEnvironment" }[url];
    return operation ? { GET: operation } : undefined;
  };
  const close = () => {
    closed = true;
    return closing ??= (async () => {
      const draining = conversations?.close();
      await agent?.close();
      await draining;
    })();
  };
  const http = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "", "http://localhost");
    if (!url.pathname.startsWith("/api/assistant/")) return false;
    if (closed) throw new Error("The Assistant Host is closing.");
    const address = req.socket.localAddress;
    if (req.socket.localPort) history().mcp.base = `http://${address?.includes(":") ? `[${address}]` : address}:${req.socket.localPort}`;
    if (!url.pathname.startsWith("/api/assistant/mcp/")) return false;
    await history().mcp.handle(req, res); return true;
  };
  return { invoke, route, close, http };
}
