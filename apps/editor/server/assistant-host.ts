import type { IncomingMessage, ServerResponse } from "node:http";
import { ASSISTANT_TRANSPORT_LIMITS } from "../shared/assistant-limits.ts";
import type { PluginService } from "./plugin-service.ts";
import { hostPaths, type HostRun } from "./host-paths.ts";
import { type FileAccess, LOCAL_FILE_ACCESS } from "./file-access.ts";
import { ASSISTANT, DEFAULT_OLLAMA_URL, PROVIDER_CLIS, isAiProvider, type AiProvider, type ProviderCli } from "../shared/assistant.ts";
import { createAssistantSettings, checkedAssistantSettings } from "./assistant-settings.ts";
import { ProviderConnections } from "./provider-connections.ts";
import { AI_PROVIDERS, conversationProvider, providerCli, providerEngine } from "./provider-engine.ts";
import { AssistantConversations, AssistantModelUnavailable, conversationForDisplay } from "./assistant-conversations.ts";

const PROVIDER_RECHECK_INTERVAL_MS = 3_000;
function providerReads<T>(read: (provider: AiProvider) => Promise<T>) {
  const latest = new Map<AiProvider, { value: T; completedAt: number }>();
  const pending = new Map<AiProvider, Promise<T>>();
  const invalidating = new Set<AiProvider>();
  const refresh = (provider: AiProvider): Promise<T> => {
    const active = pending.get(provider);
    if (active) return active;
    const next = read(provider).then(value => {
      if (pending.get(provider) === next) latest.set(provider, { value, completedAt: Date.now() });
      return value;
    }).finally(() => { if (pending.get(provider) === next) pending.delete(provider); });
    pending.set(provider, next);
    return next;
  };
  return {
    read(provider: AiProvider, cache?: string): Promise<T> {
      const previous = latest.get(provider);
      const fresh = previous && Date.now() - previous.completedAt < PROVIDER_RECHECK_INTERVAL_MS;
      if (cache === "prefer" && previous) {
        if (!fresh) void refresh(provider).catch(() => {});
        return Promise.resolve(previous.value);
      }
      if (cache === "revalidate" && fresh) return pending.get(provider) ?? Promise.resolve(previous.value);
      return refresh(provider);
    },
    invalidate(provider: AiProvider) {
      if (invalidating.has(provider)) return;
      latest.delete(provider);
      const active = pending.get(provider);
      invalidating.add(provider);
      let replacement: Promise<T>;
      if (active) {
        // Complete the current probe before replacing it. Later readers join the replacement.
        replacement = active.catch(() => {}).then(() => {
          pending.delete(provider);
          return refresh(provider);
        });
        pending.set(provider, replacement);
      } else replacement = refresh(provider);
      void replacement.catch(() => {}).finally(() => invalidating.delete(provider));
    },
    /** Settings changed what a read means: earlier reads are neither reused nor cached; the next read starts anew. */
    forget(provider: AiProvider) { latest.delete(provider); pending.delete(provider); },
  };
}

/** Official daemon feature. Connections and turns live until daemon shutdown. */
export function createAssistantHost(access: FileAccess = LOCAL_FILE_ACCESS, settingsFile?: string, options?: { agent?: ProviderConnections; run?: HostRun; plugins?: PluginService; paths?: ReturnType<typeof hostPaths>; origin?(): string | undefined }) {
  const paths = options?.paths ?? hostPaths(options?.run, { ...process.env });
  const { settings, configure } = createAssistantSettings(settingsFile ?? paths.settingsFile("assistant"), paths.assistantDefaults);
  const plugins = options?.plugins;
  let closed = false, closing: Promise<void> | undefined;
  let agent = options?.agent;
  const providerConnection = () => {
    if (!agent) agent = new ProviderConnections(paths.assistant, undefined, undefined, options?.run, options?.origin);
    // The Ollama address is read when an Ollama process launches, never pushed into a running one.
    agent.ollamaUrl = () => settings().ollamaUrl ?? DEFAULT_OLLAMA_URL;
    return agent;
  };
  const readModels = providerReads(async selected => {
    if (closed) throw new Error("The Assistant Host is closing.");
    return providerConnection().models(selected, "fresh");
  });
  const readDiagnostics = providerReads(async selected => {
    if (closed) throw new Error("The Assistant Host is closing.");
    return providerConnection().diagnostics(selected);
  });
  const recheckProvider = (selected: AiProvider) => {
    if (closed) return;
    readModels.invalidate(selected);
    readDiagnostics.invalidate(selected);
  };
  let conversations: AssistantConversations | undefined;
  const history = () => conversations ??= new AssistantConversations(providerConnection(), access, plugins?.host);
  const provider = (args?: { provider?: AiProvider }): AiProvider => {
    const value = args?.provider ?? settings().provider;
    if (!isAiProvider(value)) throw new Error("Invalid AI provider.");
    return value;
  };
  /** CLI updates are per executable: `codex` or `copilot` (which also runs Ollama). */
  const cli = (args?: { provider?: string }): ProviderCli => {
    const value = args?.provider ?? providerCli(settings().provider);
    if (!PROVIDER_CLIS.includes(value as ProviderCli)) throw new Error("Invalid AI provider CLI.");
    return value as ProviderCli;
  };
  const assistantOperations = {
    assistantSkills: async (args?: { provider?: AiProvider }) => {
      if (providerEngine(provider(args)) !== "codex") throw new Error("Skill selection is available only with Codex.");
      await plugins?.start();
      const catalog = await providerConnection().skills();
      return { ...catalog, skills: catalog.skills.map(skill => {
        const displayName = plugins?.host.skillDisplayName(skill.path);
        return displayName ? { ...skill, displayName } : skill;
      }) };
    },
    assistantModels: (args?: { provider?: AiProvider; cache?: string }) => readModels.read(provider(args), args?.cache),
    assistantDiagnostics: async (args?: { provider?: AiProvider; summary?: string; cache?: string }) => {
      const selected = provider(args);
      const connection = providerConnection();
      if (args?.summary !== "account-usage") return readDiagnostics.read(selected, args?.cache);
      if (selected !== "codex") return { provider: selected, checkedAt: Date.now() };
      const value = await connection.accountUsage();
      return { ...value, accountError: value.accountError ? "Unavailable" : undefined, rateLimitsError: value.rateLimitsError ? "Unavailable" : undefined };
    },
    assistantEnvironment: () => providerConnection().environment(),
    /** A provider CLI's own update on this Host; the run outlives the screen and is one per executable. */
    assistantProviderUpdate: (args?: { provider?: string }) => providerConnection().updates.state(cli(args)),
    startProviderUpdate: (args?: { provider?: string }) => {
      const selected = cli(args);
      return providerConnection().updateCli(selected, () => { for (const value of AI_PROVIDERS) if (providerCli(value) === selected) recheckProvider(value); });
    },
    assistantConversations: (args: any) => {
      if (args.submissionId) return history().submission(args.submissionId);
      if (!args.id) {
        const selected = args.provider === undefined ? undefined : provider(args);
        return history().list()
          .filter(info => !selected || conversationProvider(info) === selected)
          .map(({ attachments: _attachments, ...info }) => info);
      }
      const conversation = history().current(args.id);
      return conversation;
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
      if (args.action === "rename") return history().rename(args.id, args.title);
      if (args.action === "archive" || args.action === "unarchive") return history().archive(args.id, args.action === "archive");
      if (args.action === "provider-log" && Object.keys(args).every(key => ["action", "id", "provider"].includes(key))) return history().providerLog(args.id, args.provider);
      if (args.action === "send" && args.submissionId !== undefined) return history().submit(args, () => sendConversation(args));
      return sendConversation(args);
    },
  };
  const sendConversation = async (args: any): Promise<any> => {
      if (args.action === "send") await plugins?.start();
      if (closed) throw new Error("The Assistant Host is closing.");
      const currentSettings = settings();
      if (args.action === "file-change-compare" || args.action === "file-change-undo") return history().fileChange(args.id, args.turnId, args.path, args.action === "file-change-undo", args.folders ?? []);
      if (args.action === "resume") return history().resume(args.id, currentSettings);
      if (args.action === "send") {
        const existing = args.id ? history().current(args.id) : undefined;
        const selected = provider({ provider: existing?.provider ?? args.provider ?? currentSettings.provider });
        // Steering and cancellation retain their admitted turn and connection.
        if (!existing?.turns.some(turn => turn.status === "inProgress")) {
          const status = await readDiagnostics.read(selected).catch(error => { recheckProvider(selected); throw error; });
          if (!status.connected || selected === "codex" && !status.account) {
            recheckProvider(selected);
            throw new Error(`AI provider ${selected} is unavailable: ${status.error ?? status.accountError ?? "Sign in on the Host."}`);
          }
          if (closed) throw new Error("The Assistant Host is closing.");
        }
        return history().send(args, currentSettings).catch(error => {
          if (error instanceof AssistantModelUnavailable) recheckProvider(selected);
          throw error;
        });
      }
      if (args.action === "answer") return history().answer(args.id, args.turnId, args.requestId, args.answers);
      if (args.action === "interrupt") return history().interrupt(args.id);
      throw new Error("Unknown conversation action.");
  };
  const invoke = async (operation: string, args: any = {}): Promise<any> => {
    if (closed) throw new Error("The Assistant Host is closing.");
    if (operation === "settings") return settings();
    if (operation === "configure") {
      const current = settings(), next = checkedAssistantSettings(args);
      const selected = provider(next);
      const addressChanged = next.ollamaUrl !== current.ollamaUrl;
      if (selected !== current.provider || next?.model !== current.model || next?.reasoningEffort !== current.reasoningEffort) {
        // The model is validated against the catalog of the address being saved (next), not the stored one.
        const catalog = selected === "ollama" && addressChanged ? await providerConnection().models("ollama", "fresh", next.ollamaUrl)
          : await assistantOperations.assistantModels({ provider: selected });
        const model = catalog.models.find(model => model.model === next.model);
        if (!model) throw new Error(`AI model: allowed values for ${selected}: ${catalog.models.map(model => model.model).join(", ") || "none available"}.`);
        if (!model.supportedReasoningEfforts.some(effort => effort.reasoningEffort === next.reasoningEffort)) throw new Error(`AI reasoningEffort: allowed values for ${next.model}: ${model.supportedReasoningEfforts.map(effort => effort.reasoningEffort).join(", ") || "none available"}.`);
      }
      if (closed) throw new Error("The Assistant Host is closing.");
      if (selected !== current.provider) conversations?.expireProviderQuestions(current.provider);
      const saved = configure(next);
      if (addressChanged) { readModels.forget("ollama"); readDiagnostics.forget("ollama"); }
      return saved;
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
    if (url === ASSISTANT.providerUpdateRoute) return { GET: "assistantProviderUpdate", POST: "startProviderUpdate" };
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
