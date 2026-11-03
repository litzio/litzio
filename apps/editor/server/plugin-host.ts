import path from "node:path";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { HostModule, HostPlugin } from "@litzio/plugin-api/host";
import { decodeUtf8 } from "@litzio/file-commit";
import { hostPaths, type HostRun } from "./host-paths.ts";
import { accessPath, type FileAccess, LOCAL_FILE_ACCESS } from "./file-access.ts";
import { resolveDocumentPath, resolveMediaPath } from "./document-path.ts";
import { readModel } from "./document-replay.ts";
import { readPluginBuild, registrationError } from "./plugin-store.ts";
import { PluginRuntime } from "./plugin-runtime.ts";
import { AI_TASK, AI_AGENT, type AiTaskService, type AiProvider, type AiAgentSettings } from "@litzio/plugin-api/ai";
import { AiAgentConnection } from "./ai-agent-connection.ts";
import { AiAgentConversations } from "./ai-agent-conversations.ts";

declare const __LITZIO_DOCLING_DIRECTORY__: string;
declare const __LITZIO_AI_DIRECTORY__: string;
export function bundledAiManifest() {
  return fileURLToPath(new URL(`${typeof __LITZIO_AI_DIRECTORY__ === "string" ? __LITZIO_AI_DIRECTORY__ : "../../../tmp/ai-agent-worker"}/manifest.json`, import.meta.url));
}
export function bundledPluginManifest() {
  return fileURLToPath(new URL(`${typeof __LITZIO_DOCLING_DIRECTORY__ === "string" ? __LITZIO_DOCLING_DIRECTORY__ : "../../../tmp/docling-worker"}/manifest.json`, import.meta.url));
}
export function pluginsDirectory() { return hostPaths().plugins; }

/** Load declared trusted operations, never plugin source or an application import. */
export function createPluginHost(access: FileAccess = LOCAL_FILE_ACCESS, settingsFile?: string, options?: { directory?: string; manifest?: string; timeoutMs?: number; aiManifest?: string; aiTimeoutMs?: number; agent?: AiAgentConnection; run?: HostRun }) {
  let runtime: PluginRuntime | undefined, closed = false, closing: Promise<void> | undefined;
  const paths = hostPaths(options?.run, { ...process.env });
  const directory = path.resolve(options?.directory ?? paths.plugins);
  const activations = new Map<string, HostPlugin>();
  const sessions = new Map<string, Map<string, unknown>>();
  let agent: AiAgentConnection | undefined = options?.agent;
  let conversations: AiAgentConversations | undefined;
  const history = () => conversations ??= new AiAgentConversations(agent ??= new AiAgentConnection(paths.agent), access);
  const provider = (args?: { provider?: AiProvider }): AiProvider => {
    const value = args?.provider ?? load(AI_TASK.plugin).operations.settings({}).provider;
    if (value !== "codex" && value !== "copilot") throw new Error("Invalid AI provider.");
    return value;
  };
  const agentOperations = {
    agentSkills: () => {
      if (provider() !== "codex") throw new Error("Skill selection is available only with Codex.");
      return (agent ??= new AiAgentConnection(paths.agent)).skills();
    },
    agentModels: (args?: { provider?: AiProvider }) => (agent ??= new AiAgentConnection(paths.agent)).models(provider(args)),
    agentDiagnostics: (args?: { provider?: AiProvider }) => (agent ??= new AiAgentConnection(paths.agent)).diagnostics(provider(args)),
    agentEnvironment: () => (agent ??= new AiAgentConnection(paths.agent)).environment(),
    agentConversations: (args: any) => {
      if (!args.id) return history().list().filter(info => (info.provider ?? "codex") === provider());
      const conversation = history().current(args.id);
      if ((conversation.provider ?? "codex") !== provider()) throw new Error("Select this conversation's provider first.");
      return conversation;
    },
    agentConversation: (args: any) => {
      const settings = load(AI_TASK.plugin).operations.settings({});
      if (args.action === "resume") return history().resume(args.id, settings);
      if (args.action === "send") return history().send(args, settings);
      if (args.action === "answer") return history().answer(args.id, args.turnId, args.requestId, args.answers);
      if (args.action === "interrupt") return history().interrupt(args.id);
      throw new Error("Unknown conversation action.");
    },
  };
  const getRuntime = () => {
    if (closed) throw new Error("The plugin runtime is closing.");
    return runtime ??= new PluginRuntime(directory, options?.manifest ?? bundledPluginManifest(), options?.timeoutMs, file => { accessPath(file, access, true); });
  };
  const plugins = (seed = false) => {
    const value = getRuntime();
    if (seed) {
      value.ensureBundled();
      if (!value.store.list().some(item => item.id === AI_TASK.plugin)) value.store.register(options?.aiManifest ?? bundledAiManifest(), true);
    }
    return value.store;
  };
  const bundled = () => [options?.manifest ?? bundledPluginManifest(), options?.aiManifest ?? bundledAiManifest()]
    .map(file => ({ file, ...readPluginBuild(file) }));
  const inventory = () => {
    const defaults = bundled();
    return plugins(true).list().map(item => ({ ...item,
      bundledRevision: defaults.find(build => build.manifest.id === item.id)?.revision ?? null,
      registrationError: registrationError(item) }));
  };
  const reregister = (id: string) => {
    const build = bundled().find(build => build.manifest.id === id);
    if (!build) throw new Error("Plugin is not bundled with this app.");
    return plugins().register(build.file);
  };
  const load = (id: string) => {
    const store = plugins(true), installation = store.list().find(item => item.id === id);
    if (!installation?.host) throw new Error("Plugin Host operations are unavailable.");
    const problem = registrationError(installation);
    if (problem) throw new Error(problem);
    const key = `${id}/${installation.revision}`;
    let plugin = activations.get(key);
    if (!plugin) {
      const file = store.hostEntry(id);
      const module: HostModule = createRequire(import.meta.url)(file);
      plugin = module.activate({
        features: () => store.list().find(item => item.id === id)?.features ?? {},
        setFeatures: features => store.setFeatures(id, features),
        aiDefaults: paths.aiDefaults,
        settingsFile: settingsFile ?? paths.settingsFile(id),
        resolvePath: (file, create) => accessPath(file, access, create),
        documentPath: file => resolveDocumentPath(file, access),
        mediaPath: (uri, file) => resolveMediaPath(uri, file, access),
        readText: file => decodeUtf8(readFileSync(accessPath(file, access))),
        validateDocument: source => { readModel(source); },
        session: sessions.get(id) ?? sessions.set(id, new Map()).get(id)!,
        requestOwner: () => getRuntime().store.requestOwner(),
        isRequestOwnerAlive: owner => getRuntime().store.isRequestOwnerAlive(owner),
        executor: { start: request => getRuntime().start({ ...request, plugin: id }), current: id => getRuntime().current(id),
          cancel: id => getRuntime().cancel(id), close: () => close(),
          history: () => getRuntime().requestHistory(id), forget: request => getRuntime().forgetRequest(request, id) },
        aiExecutor: { start: (request, timeoutMs, execution) => getRuntime().ai.start(request, options?.aiTimeoutMs ?? timeoutMs, id, execution),
          current: request => getRuntime().ai.current(request), cancel: request => getRuntime().ai.cancel(request) },
        aiTasks: () => {
          const service = aiTasks();
          if (!service) return undefined;
          const own = (request: string) => {
            const record = service.current(request);
            if (record && record.job.caller !== id) throw new Error("AI task belongs to another caller.");
            return record;
          };
          return { status: service.status, start: request => {
            if (request.caller !== id || !plugins().list().find(item => item.id === id)?.enabled) throw new Error("AI task caller is unavailable or mismatched.");
            if (!aiTasks()) throw new Error("AI agent is disabled.");
            return service.start(request);
          }, current: own, cancel: request => { own(request); return service.cancel(request); } };
        },
      });
      activations.set(key, plugin);
    }
    return plugin;
  };
  const aiTasks = (): AiTaskService | undefined => {
    const installation = plugins(true).list().find(item => item.enabled && item.services?.includes(AI_TASK.service));
    return installation ? load(installation.id).aiTaskService : undefined;
  };
  const closeAgent = async () => {
    if (agent) { await agent.close(); agent = undefined; conversations = undefined; }
  };
  const unregister = async (id: string) => {
    plugins().unregister(id);
    if (id === AI_TASK.plugin) await closeAgent();
  };
  const invoke = <T = any>(id: string, operation: string, args: unknown = {}): T => {
    const plugin = load(id);
    if (id === AI_TASK.plugin && Object.hasOwn(agentOperations, operation)) {
      if (!plugins().list().find(item => item.id === id)?.enabled) throw new Error("Plugin is disabled.");
      if (operation !== "agentEnvironment" && !plugin.operations.settings({}).enabled) throw new Error("Codex is disabled.");
      return agentOperations[operation as keyof typeof agentOperations](args) as T;
    }
    if (!Object.hasOwn(plugin.operations, operation)) throw new Error("Unknown plugin operation.");
    if (!plugins().list().find(item => item.id === id)?.enabled && !plugin.drainingOperations?.includes(operation)) throw new Error("Plugin is disabled.");
    if (id === AI_TASK.plugin && operation === "configure") return (async () => {
      const next = args as AiAgentSettings;
      const current = plugin.operations.settings({});
      const selected = provider(next);
      if (selected !== current.provider || next?.model !== current.model || next?.reasoningEffort !== current.reasoningEffort) {
        const catalog = await agentOperations.agentModels({ provider: selected });
        if (!catalog.models.some(model => model.model === next?.model && model.supportedReasoningEfforts.some(effort => effort.reasoningEffort === next.reasoningEffort))) throw new Error("Invalid AI model or reasoning effort.");
      }
      if (!plugins().list().find(item => item.id === id)?.enabled) throw new Error("Plugin is disabled.");
      const stored = plugin.operations.configure(selected === "copilot" ? { ...next,
        codexTaskSettings: current.provider === "codex" ? { model: current.model, reasoningEffort: current.reasoningEffort } : current.codexTaskSettings } : next);
      if (!stored.enabled || stored.provider !== current.provider) await closeAgent();
      return stored;
    })() as T;
    return plugin.operations[operation](args);
  };
  const route = (url: string) => {
    if (url === AI_AGENT.conversationsRoute) { plugins(true); return { id: AI_TASK.plugin, methods: { GET: "agentConversations", POST: "agentConversation" } }; }
    const operation = { [AI_AGENT.skillsRoute]: "agentSkills", [AI_AGENT.modelsRoute]: "agentModels", [AI_AGENT.diagnosticsRoute]: "agentDiagnostics", [AI_AGENT.environmentRoute]: "agentEnvironment" }[url];
    if (operation) { plugins(true); return { id: AI_TASK.plugin, methods: { GET: operation } }; }
    for (const installation of plugins(true).list()) if (installation.host && installation.routes?.includes(url)) {
      const methods = load(installation.id).routes[url];
      if (methods) return { id: installation.id, methods };
    }
  };
  const close = () => {
    closed = true;
    return closing ??= Promise.allSettled([runtime?.close(), agent?.close()]).then(results => {
      const failed = results.find(result => result.status === "rejected"); if (failed?.status === "rejected") throw failed.reason;
    }).finally(() => { activations.clear(); sessions.clear(); });
  };
  return { plugins, inventory, reregister, unregister, invoke, route, aiTasks, close };
}
