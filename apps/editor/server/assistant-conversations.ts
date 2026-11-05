import { PLUGIN_AUTHORING_SKILL } from "./plugins/authoring-skill.ts";
import { pluginTools, executePluginTool, pluginJobTools, executePluginJobTool } from "./assistant-plugin-tools.ts";
import { viewGenerationContext } from "../shared/view-generation.ts";
import type { PluginHost } from "./plugins/plugin-host.ts";
import { templateTools, executeTemplateOperation, templateOperations } from "./document-templates.ts";
import { readFileSync, writeFileSync, renameSync, existsSync, statSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { AssistantUserInputAnswers, AssistantSettings, AssistantConversation, AssistantConversationInfo, AssistantConversationInput, AssistantConversationItem, AssistantConversationTurn } from "../shared/assistant.ts";
import type { ProviderConnections } from "./provider-connections.ts";
import { accessPath, RootAccess, type FileAccess } from "./file-access.ts";

import { listFolder } from "./document-api.ts";
import { documentTools, executeDocumentTool, type DocumentToolScope } from "./assistant-document-tools.ts";
import { ASSISTANT_INSTRUCTIONS } from "./provider-connections.ts";
import type { SessionNotification, RequestPermissionRequest, RequestPermissionResponse } from "@agentclientprotocol/sdk";
import { COPILOT_EFFORTS, copilotOptions, copilotReasoning, copilotChoices } from "./copilot-acp.ts";

import { AgentDisplayRequests, displayTools } from "./assistant-display-tools.ts";

type ConversationIndexEntry = AssistantConversationInfo & { copilotCliReasoningEffort?: string };

/** Litzio persists only its history index. Each CLI owns its conversation content. */
export class AssistantConversations {
  readonly display = new AgentDisplayRequests();
  private conversations = new Map<string, AssistantConversation>();
  private pending = new Set<string>();
  private scopes = new Map<string, DocumentToolScope & { turnId?: string; displayClient?: string; viewGeneration?: boolean }>();
  private answers = new Map<string, (answers: AssistantUserInputAnswers) => void>();
  private loaded = new Set<string>();
  constructor(private connection: ProviderConnections, private access: FileAccess, private plugins?: PluginHost) {
    connection.copilot.on("update", (params: SessionNotification) => this.copilotUpdate(params));
    connection.copilot.on("disconnected", (message: string) => {
      for (const conversation of this.conversations.values()) if (conversation.provider === "copilot") {
        this.loaded.delete(conversation.id); this.scopes.delete(conversation.id);
        for (const turn of conversation.turns) if (turn.status === "inProgress") { turn.status = "failed"; turn.error = message; }
      }
    });
    connection.copilot.permission = request => this.copilotPermission(request);
    connection.client.userInput = (requestId, params, respond) => {
      const conversation = this.conversations.get(params?.threadId);
      if (!conversation?.turns.some(turn => turn.id === params.turnId && turn.status === "inProgress") || conversation.userInput ||
        !Array.isArray(params.questions) || !params.questions.length || params.questions.some((q: any) =>
          typeof q.id !== "string" || typeof q.header !== "string" || typeof q.question !== "string" ||
          typeof q.isOther !== "boolean" || typeof q.isSecret !== "boolean" ||
          q.options !== null && (!Array.isArray(q.options) || q.options.some((o: any) => typeof o.label !== "string" || typeof o.description !== "string"))) ||
        new Set(params.questions.map((q: any) => q.id)).size !== params.questions.length) throw new Error("Invalid or inactive question.");
      conversation.userInput = { requestId, turnId: params.turnId, questions: params.questions };
      this.answers.set(conversation.id, respond);
    };
    connection.client.toolCall = async params => {
      const scope = this.scopes.get(params?.threadId);
      const active = this.conversations.get(params?.threadId)?.turns.find(turn => turn.id === params.turnId && turn.status === "inProgress");
      if (!scope || !active || scope.turnId !== params.turnId || params.namespace != null) throw new Error("No authorized active turn for this tool call.");
      if (scope.viewGeneration) throw new Error("View generation only proposes a definition; tools are unavailable for this turn.");
      if (params.tool === "plugin_jobs" && this.plugins) {
        const activity: AssistantConversationItem = { id: `plugin-job-${randomUUID()}`, kind: "tool", text: `plugin_jobs · ${String(params.arguments?.action ?? "")}`, status: "inProgress" };
        active.items.push(activity);
        try {
          const result = await executePluginJobTool(this.plugins, params.arguments, scope);
          activity.status = "completed";
          activity.toolResult = { success: true, contentItems: [{ type: "inputText", text: JSON.stringify(result) }] };
          this.save(this.current(params.threadId));
          return { ...activity.toolResult };
        } catch (error) {
          activity.status = "failed";
          activity.toolResult = { success: false, contentItems: [{ type: "inputText", text: String(error) }] };
          this.save(this.current(params.threadId));
          return { ...activity.toolResult };
        }
      }
      const templateScope = { ...scope, directory: this.connection.templatesDirectory };
      const result = params.tool === "manage_plugins" && this.plugins
        ? await executePluginTool(this.plugins, params.arguments, entry => {
          active.items.push({ id: randomUUID(), kind: "tool", text: `plugins.${entry.action}${entry.id ? ` (${entry.id})` : ""}: ${entry.outcome}`, status: entry.outcome });
        }, scope)
        : displayTools.some(tool => tool.name === params.tool)
        ? await this.display.execute(params.tool, params.arguments, params.threadId, scope.displayClient)
        : params.tool === templateOperations.list.name ? executeTemplateOperation("list", params.arguments, templateScope)
        : params.tool === templateOperations.read.name ? executeTemplateOperation("read", params.arguments, templateScope)
        : params.tool === templateOperations.save.name ? executeTemplateOperation("save", params.arguments, templateScope)
        : executeDocumentTool(params.tool, params.arguments, templateScope);
      return { contentItems: [{ type: "inputText", text: JSON.stringify(result) }], success: !(result && typeof result === "object" && "error" in result && result.error) };
    };
    connection.client.on("notification", (method, params) => this.notification(method, params));
    connection.client.on("disconnected", (message: string) => {
      this.display.cancel();
      for (const [id, conversation] of this.conversations) if (conversation.provider !== "copilot") { this.loaded.delete(id); this.scopes.delete(id); }
      for (const conversation of this.conversations.values()) if (conversation.provider !== "copilot") this.expireQuestion(conversation);
      for (const conversation of this.conversations.values()) if (conversation.provider !== "copilot") for (const turn of conversation.turns) {
        if (turn.status === "inProgress") { turn.status = "failed"; turn.error = message; }
      }
    });
  }
  private get file() { return path.join(this.connection.cwd, "conversations.json"); }
  list(): ConversationIndexEntry[] {
    this.connection.environment();
    return existsSync(this.file) ? JSON.parse(readFileSync(this.file, "utf8")) : [];
  }
  private save(conversation: AssistantConversation) {
    const { id, title, folders, createdAt, updatedAt, provider, permissionMode } = conversation;
    const entries = this.list().filter(entry => entry.id !== id);
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify([{ id, title, folders, createdAt, updatedAt, ...(provider ? { provider } : {}), ...(permissionMode ? { permissionMode } : {}),
        ...(provider === "copilot" && conversation.copilot?.reasoningEffortSource === "cli" ? { copilotCliReasoningEffort: conversation.reasoningEffort } : {}) }, ...entries]) + "\n", { flag: "wx" });
      renameSync(temporary, this.file);
    } finally { if (existsSync(temporary)) unlinkSync(temporary); }
  }
  current(id: string) {
    const conversation = this.conversations.get(id);
    if (!conversation) throw new Error("Resume the conversation first.");
    return conversation;
  }
  async resume(id: string, settings: AssistantSettings, turnPermissionMode?: AssistantSettings["permissionMode"]) {
    if (typeof id !== "string") throw new Error("Invalid conversation selection.");
    const info = this.list().find(entry => entry.id === id);
    if (!info) throw new Error("Conversation was not found.");
    // Only this Host's memory can retain a user-approved elevation. The cwd index
    // is assistant-writable and is never authority for a stronger grant.
    const grants = ["read-only", "opened-folders", "full-access"];
    const stored = grants.indexOf(info.permissionMode ?? "");
    const restored = stored >= 0 && stored <= grants.indexOf(settings.permissionMode) ? info.permissionMode! : settings.permissionMode;
    settings = { ...settings, provider: info.provider ?? "codex", permissionMode: turnPermissionMode ?? this.conversations.get(id)?.permissionMode ?? restored };
    if (this.conversations.get(id)?.turns.some(turn => turn.status === "inProgress")) return this.current(id);
    if (info.provider === "copilot") await this.prepareCopilotLaunch(info.copilotCliReasoningEffort ?? this.connection.copilot.reasoningEffort, settings);
    const conversation: AssistantConversation = { ...info, permissionMode: settings.permissionMode, turns: [], model: settings.model, reasoningEffort: settings.reasoningEffort,
      tokenUsage: this.conversations.get(id)?.tokenUsage };
    // Install before the RPC so token-usage notifications during resume are retained.
    this.conversations.set(id, conversation);
    if (info.provider === "copilot") {
      this.loaded.delete(id);
      const client = await this.connection.copilot.connect();
      if (!this.connection.copilot.loadSession) throw new Error("This Copilot CLI cannot resume sessions. Start a new conversation.");
      const session = await this.connection.copilot.call(() => client.loadSession({ sessionId: id, cwd: this.connection.cwd, mcpServers: [] }));
      conversation.model = session.models?.currentModelId ?? settings.model;
      this.connection.copilot.remember({ ...session, sessionId: id });
      conversation.copilot = copilotOptions({ ...session, sessionId: id });
      const reasoning = copilotReasoning(session);
      if (!reasoning && !COPILOT_EFFORTS.includes(info.copilotCliReasoningEffort ?? "")) throw new Error("This Copilot conversation has no saved CLI reasoning effort. Start a new conversation.");
      conversation.reasoningEffort = reasoning?.currentValue ?? info.copilotCliReasoningEffort!;
      this.loaded.add(id);
      return conversation;
    }
    const result = await this.connection.client.request("thread/resume", { threadId: id, cwd: this.connection.cwd,
      approvalPolicy: "never", sandbox: "read-only", excludeTurns: true });
    // Codex uses paginated histories; hydrate full turns rather than only the latest page.
    const turns: any[] = []; let cursor: string | null = null;
    do {
      const page: { data: any[]; nextCursor: string | null } = await this.connection.client.request("thread/turns/list", { threadId: id, cursor, sortDirection: "asc", itemsView: "full" });
      turns.push(...page.data); cursor = page.nextCursor;
    } while (cursor);
    conversation.turns = turns.map(turnFrom); conversation.model = result.model ?? settings.model;
    conversation.reasoningEffort = result.reasoningEffort ?? settings.reasoningEffort;
    this.conversations.set(id, conversation);
    this.loaded.add(id);
    return conversation;
  }
  async send(input: AssistantConversationInput, settings: AssistantSettings, displayClient?: string) {
    if (input?.viewGeneration !== undefined && typeof input.viewGeneration !== "boolean") throw new Error("Invalid view generation input");
    if (input?.viewGeneration) input = { ...input, permissionMode: "read-only", folders: [], references: [], skills: [], document: undefined };
    if (!input || typeof input.message !== "string" || (!input.message.trim() && !input.references?.length) ||
      typeof input.model !== "string" || typeof input.reasoningEffort !== "string" || !Array.isArray(input.folders)) throw new Error("Invalid conversation input.");
    const existing = input.id ? this.current(input.id) : undefined;
    if (input.viewGeneration && existing?.turns.some(turn => turn.status === "inProgress")) throw new Error("Stop the response before generating a view.");
    if (input.provider !== undefined && input.provider !== "codex" && input.provider !== "copilot") throw new Error("Invalid AI provider.");
    if (input.permissionMode !== undefined && !["opened-folders", "read-only", "full-access"].includes(input.permissionMode)) throw new Error("Invalid permission mode.");
    if (existing && input.provider !== undefined && input.provider !== (existing.provider ?? "codex")) throw new Error("Provider is locked after a conversation starts.");
    settings = { ...settings, provider: existing?.provider ?? input.provider ?? settings.provider,
      permissionMode: input.permissionMode ?? existing?.permissionMode ?? settings.permissionMode };
    const folders = [...new Set(input.folders.map(folder => {
      if (typeof folder !== "string" || !path.isAbsolute(folder)) throw new Error("Invalid opened folder.");
      const resolved = accessPath(folder, this.access);
      if (!statSync(resolved).isDirectory()) throw new Error("Opened folder is unavailable.");
      return resolved;
    }))];
    let references = checkedReferences(input.references ?? [], folders, this.access);
    if (input.document) {
      if (typeof input.document.path !== "string") throw new Error("Invalid document context.");
      accessPath(input.document.path, this.access);
    }
    let conversation = input.id ? this.current(input.id) : undefined;
    const key = settings.provider === "copilot" ? "copilot" : input.id ?? "new";
    if (this.pending.has(key)) throw new Error("A conversation request is already pending.");
    this.pending.add(key);
    try {
      this.connection.environment();
      if (conversation && (conversation.provider ?? "codex") !== settings.provider) throw new Error("Start a conversation with the selected provider.");
      if (settings.provider === "copilot") {
        if (input.skills?.length) throw new Error("Skill selection is available only with Codex.");
        return await this.sendCopilot(input, settings, folders, references, conversation);
      }
      if (conversation && !this.loaded.has(conversation.id)) conversation = await this.resume(conversation.id, settings, settings.permissionMode);
      const active = conversation?.turns.find(turn => turn.status === "inProgress");
      if (active && (input.model !== conversation!.model || input.reasoningEffort !== conversation!.reasoningEffort)) throw new Error("Model and reasoning effort are locked while running.");
      if (!active) {
        const models = await this.connection.models();
        if (!models.models.some(model => model.model === input.model && model.supportedReasoningEfforts.some(effort => effort.reasoningEffort === input.reasoningEffort))) throw new Error("Invalid AI model or reasoning effort.");
      }
      const selected = input.skills ?? [];
      if (!Array.isArray(selected) || selected.some(skill => !skill || typeof skill.name !== "string" || typeof skill.path !== "string")) throw new Error("Invalid skills.");
      const skills = selected.filter(skill => input.message.split(/\s+/).includes(`$${skill.name}`)).filter((skill, index, all) => all.findIndex(other => other.path === skill.path) === index).map(({ name, path }) => ({ name, path }));
      if (skills.length) {
        const catalog = await this.connection.skills();
        if (skills.some(skill => !catalog.skills.some(active => active.name === skill.name && active.path === skill.path))) throw new Error("Selected skill is no longer active. Choose it again.");
      }
      if (!conversation) {
        const result = await this.connection.client.request("thread/start", { model: input.model, cwd: this.connection.cwd,
          approvalPolicy: "never", sandbox: "read-only", ephemeral: false, dynamicTools: [...documentTools, ...displayTools, ...templateTools, ...(this.plugins ? [...pluginTools, ...pluginJobTools] : [])] });
        conversation = { id: result.thread.id, title: (input.message.trim() || [...references, ...skills].map(file => file.name).join(", ")).slice(0, 80), folders, createdAt: Date.now(), updatedAt: Date.now(),
          turns: [], provider: "codex", permissionMode: settings.permissionMode, model: input.model, reasoningEffort: input.reasoningEffort };
        this.conversations.set(conversation.id, conversation);
        this.loaded.add(conversation.id);
        this.save(conversation);
      }
      references = checkedReferences(input.references ?? [], folders, this.access);
      const context = { folders, document: input.document ? { path: input.document.path } : null, references: [...references, ...skills.map(skill => ({ ...skill, kind: "skill" }))], ...(input.viewGeneration ? { viewGeneration: viewGenerationContext(this.plugins?.viewOperations()) } : {}) };
      const messages: object[] = [{ type: "text", text: input.message, text_elements: [] }, { type: "text", text: CONTEXT + JSON.stringify(context), text_elements: [] }];
      if (this.plugins) messages.push({ type: "text", text: PLUGIN_AUTHORING_SKILL, text_elements: [] });
      messages.push(...skills.map(skill => ({ type: "skill", name: skill.name, path: skill.path })));
      messages.push(...references.filter(file => /\.(png|jpe?g|webp|gif)$/i.test(file.path)).map(file => ({ type: "localImage", path: file.path })));
      if (active) {
        await this.connection.client.request("turn/steer", { threadId: conversation.id, expectedTurnId: active.id, input: messages });
      } else {
        conversation.model = input.model; conversation.reasoningEffort = input.reasoningEffort; conversation.permissionMode = settings.permissionMode;
        this.scopes.set(conversation.id, { folders: folders.length ? new RootAccess(folders) : null, permissionMode: settings.permissionMode, access: this.access, displayClient, viewGeneration: input.viewGeneration });
        const result = await this.connection.client.request("turn/start", { threadId: conversation.id, input: messages,
          cwd: this.connection.cwd, model: input.model, effort: input.reasoningEffort, summary: "auto", approvalPolicy: "never",
          sandboxPolicy: settings.permissionMode === "full-access" ? { type: "dangerFullAccess" } : settings.permissionMode === "opened-folders" ? { type: "workspaceWrite", writableRoots: folders,
            networkAccess: false, excludeTmpdirEnvVar: true, excludeSlashTmp: true } : { type: "readOnly", networkAccess: false } });
        const scope = this.scopes.get(conversation.id); if (scope) scope.turnId = result.turn.id;
        if (!conversation.turns.some(turn => turn.id === result.turn.id)) conversation.turns.push(turnFrom(result.turn));
      }
      conversation.folders = folders; conversation.updatedAt = Date.now();
      this.save(conversation);
      return conversation;
    } finally { this.pending.delete(key); }
  }
  private expireQuestion(conversation: AssistantConversation) {
    delete conversation.userInput; this.answers.delete(conversation.id);
  }
  answer(id: string, turnId: string, requestId: string | number, answers: AssistantUserInputAnswers) {
    const conversation = this.current(id), question = conversation.userInput, respond = this.answers.get(id);
    if (!question || !respond || question.requestId !== requestId || question.turnId !== turnId ||
      !conversation.turns.some(turn => turn.id === turnId && turn.status === "inProgress")) throw new Error("Question expired.");
    if (!answers || Object.keys(answers).length !== question.questions.length || question.questions.some(q => {
      if (!Object.hasOwn(answers, q.id)) return true;
      const answer = answers[q.id];
      const values = answer && Object.hasOwn(answer, "answers") ? answer.answers : undefined;
      return !Array.isArray(values) || values.length !== 1 || typeof values[0] !== "string" || !values[0].trim() ||
        q.options?.length && !q.isOther && !q.options.some(option => option.label === values[0]);
    })) throw new Error("Invalid question answers.");
    this.expireQuestion(conversation); // Consume synchronously before writing; duplicate submissions cannot reply twice.
    respond(answers);
    return conversation;
  }
  async interrupt(id: string) {
    const conversation = this.current(id), turn = conversation.turns.find(turn => turn.status === "inProgress");
    this.expireQuestion(conversation);
    this.display.cancel(id);
    if (turn && conversation.provider === "copilot") {
      const client = await this.connection.copilot.connect();
      await this.connection.copilot.call(() => client.cancel({ sessionId: id }));
    } else if (turn) await this.connection.client.request("turn/interrupt", { threadId: id, turnId: turn.id });
    return conversation;
  }
  private async sendCopilot(input: AssistantConversationInput, settings: AssistantSettings, folders: string[], references: import("../shared/assistant.ts").AssistantFileReference[], conversation?: AssistantConversation) {
    const acp = this.connection.copilot;
    if (conversation?.turns.some(turn => turn.status === "inProgress")) throw new Error("Stop the Copilot response before sending another message.");
    const catalog = await this.connection.models("copilot");
    if (!catalog.models.some(model => model.model === input.model)) throw new Error("Invalid Copilot model.");
    if (input.mode !== undefined && !catalog.copilot?.modes.some(mode => mode.id === input.mode)) throw new Error("Invalid Copilot session mode.");
    const source = conversation?.copilot?.reasoningEffortSource ?? catalog.copilot?.reasoningEffortSource;
    if (source === "cli") {
      if (!COPILOT_EFFORTS.includes(input.reasoningEffort)) throw new Error("Invalid Copilot reasoning effort.");
      if (conversation && conversation.reasoningEffort !== input.reasoningEffort) throw new Error("Start a new conversation to change Copilot reasoning effort.");
    }
    const effort = source === "cli" ? input.reasoningEffort : acp.reasoningEffort;
    const fullAccess = settings.permissionMode === "full-access";
    await this.prepareCopilotLaunch(effort, settings);
    if (conversation && !this.loaded.has(conversation.id)) conversation = await this.resume(conversation.id, settings, settings.permissionMode);
    const client = await acp.connect();
    if (!conversation) {
      const session = acp.remember(await acp.call(() => client.newSession({ cwd: this.connection.cwd, mcpServers: [] })));
      conversation = { id: session.sessionId, provider: "copilot", title: (input.message.trim() || references.map(file => file.name).join(", ")).slice(0, 80),
        folders, createdAt: Date.now(), updatedAt: Date.now(), permissionMode: settings.permissionMode, turns: [], model: input.model, reasoningEffort: input.reasoningEffort, copilot: copilotOptions(session) };
      this.conversations.set(conversation.id, conversation); this.loaded.add(conversation.id);
    }
    const id = conversation.id;
    await acp.call(() => client.unstable_setSessionModel({ sessionId: id, modelId: input.model }));
    const session = acp.sessions.get(id)!;
    const reasoning = copilotReasoning(session);
    if (reasoning) {
      if (!copilotChoices(reasoning).some(value => value.value === input.reasoningEffort)) throw new Error("Invalid Copilot reasoning effort for this session.");
      const result = await acp.call(() => client.setSessionConfigOption({ sessionId: id, configId: reasoning.id, value: input.reasoningEffort }));
      session.configOptions = result.configOptions;
    } else if (acp.reasoningEffort !== input.reasoningEffort) throw new Error("Start a new conversation to change Copilot reasoning effort.");
    const options = copilotOptions(session);
    const mode = input.mode ?? options.modes.find(mode => /(?:^|#)agent$/.test(mode.id))?.id;
    if (mode) {
      if (!options.modes.some(value => value.id === mode)) throw new Error("Invalid Copilot session mode.");
      await acp.call(() => client.setSessionMode({ sessionId: id, modeId: mode }));
      options.currentMode = mode;
      if (session.modes) session.modes.currentModeId = mode;
    }
    // Paseo's Allow All is Agent/Plan plus allow_all=on, not an autopilot mode.
    const allowAll = session.configOptions?.find(option => option.id === "allow_all");
    if (allowAll?.type === "select") {
      const result = await acp.call(() => client.setSessionConfigOption({ sessionId: id, configId: allowAll.id, value: fullAccess ? "on" : "off" }));
      session.configOptions = result.configOptions;
    }
    conversation.copilot = options;
    references = checkedReferences(input.references ?? [], folders, this.access);
    const context = { folders, document: input.document ? { path: input.document.path } : null, references, ...(input.viewGeneration ? { viewGeneration: viewGenerationContext(this.plugins?.viewOperations()) } : {}) };
    const turn: AssistantConversationTurn = { id: randomUUID(), status: "inProgress", items: [{ id: randomUUID(), kind: "user", text: input.message, references }] };
    conversation.turns.push(turn); conversation.model = input.model; conversation.reasoningEffort = input.reasoningEffort;
    conversation.folders = folders; conversation.updatedAt = Date.now(); conversation.permissionMode = settings.permissionMode;
    this.scopes.set(id, { folders: folders.length ? new RootAccess(folders) : null, access: this.access, permissionMode: settings.permissionMode, turnId: turn.id, viewGeneration: input.viewGeneration });
    this.save(conversation);
    // ACP prompt resolves at turn completion; return the snapshot immediately for existing panel polling.
    void client.prompt({ sessionId: id, prompt: [{ type: "text", text: ASSISTANT_INSTRUCTIONS.replace("Images are also supplied as localImage inputs.", "Image references are local paths; no image bytes are attached.") + "\nUser message:\n" + input.message + "\n\n" + CONTEXT + JSON.stringify(context) }] }).then(result => {
      if (turn.status === "inProgress") {
        turn.status = result.stopReason === "cancelled" ? "interrupted" : result.stopReason === "end_turn" ? "completed" : "failed";
        if (turn.status === "failed") turn.error = `Copilot stopped: ${result.stopReason}`;
      }
    }, error => { turn.status = "failed"; turn.error = error.message; }).finally(() => { this.scopes.delete(id); });
    return conversation;
  }
  private async prepareCopilotLaunch(effort: string, settings: AssistantSettings) {
    const acp = this.connection.copilot, fullAccess = settings.permissionMode === "full-access";
    if ((acp.reasoningEffort !== effort || acp.fullAccess !== fullAccess) && [...this.conversations.values()].some(value => value.provider === "copilot" && value.turns.some(turn => turn.status === "inProgress"))) throw new Error("Stop the Copilot response before changing launch settings.");
    await acp.useLaunchSettings(effort, fullAccess);
  }
  private copilotPermission(request: RequestPermissionRequest): RequestPermissionResponse {
    const scope = this.scopes.get(request.sessionId), tool = request.toolCall;
    const active = !scope?.viewGeneration && this.conversations.get(request.sessionId)?.turns.some(turn => turn.id === scope?.turnId && turn.status === "inProgress");
    let allowed = !!scope && !!active && (tool.kind === "read" || tool.kind === "edit" && scope.permissionMode === "opened-folders");
    if (!tool.locations?.length) allowed = false;
    if (allowed) try {
      for (const location of tool.locations!) {
        if (!path.isAbsolute(location.path) || !scope!.folders) throw new Error("No opened folder scope.");
        accessPath(accessPath(location.path, scope!.folders, tool.kind === "edit"), this.access, tool.kind === "edit");
      }
    } catch { allowed = false; }
    const fullAccess = !!scope && !!active && scope.permissionMode === "full-access";
    const option = allowed || fullAccess ? request.options.find(option => option.kind === "allow_once") ?? (fullAccess ? request.options.find(option => option.kind === "allow_always") : undefined) : undefined;
    return option ? { outcome: { outcome: "selected", optionId: option.optionId } } : { outcome: { outcome: "cancelled" } };
  }
  private copilotUpdate({ sessionId, update }: SessionNotification) {
    const conversation = this.conversations.get(sessionId); if (!conversation || conversation.provider !== "copilot") return;
    if (update.sessionUpdate === "config_option_update" || update.sessionUpdate === "current_mode_update") {
      const session = this.connection.copilot.sessions.get(sessionId);
      if (session) { conversation.copilot = copilotOptions(session); conversation.reasoningEffort = copilotReasoning(session)?.currentValue ?? conversation.reasoningEffort; }
      return;
    }
    let turn = conversation.turns.at(-1);
    if (update.sessionUpdate === "user_message_chunk" && update.content.type === "text") {
      if (turn?.status === "inProgress") return;
      const text = update.content.text, marker = text.indexOf("User message:\n");
      const item = itemFrom({ type: "userMessage", id: randomUUID(), content: [{ type: "text", text: marker < 0 ? text : text.slice(marker + "User message:\n".length) }] });
      if (item) conversation.turns.push({ id: randomUUID(), status: "completed", items: [item] });
      return;
    }
    if (!turn) { turn = { id: randomUUID(), status: "completed", items: [] }; conversation.turns.push(turn); }
    if ((update.sessionUpdate === "agent_message_chunk" || update.sessionUpdate === "agent_thought_chunk") && update.content.type === "text") {
      const kind = update.sessionUpdate === "agent_message_chunk" ? "assistant" : "reasoning";
      let item = turn.items.at(-1);
      if (item?.kind !== kind) { item = { id: randomUUID(), kind, text: "" }; turn.items.push(item); }
      item.text += update.content.text;
    } else if (update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") {
      let item = turn.items.find(item => item.id === update.toolCallId);
      if (!item) { item = { id: update.toolCallId, kind: "tool", text: "" }; turn.items.push(item); }
      if (update.title) item.text = update.title;
      if (update.status) item.status = update.status === "in_progress" ? "inProgress" : update.status;
    }
  }
  private notification(method: string, params: any) {
    const conversation = this.conversations.get(params.threadId);
    if (!conversation) return;
    if (method === "serverRequest/resolved") {
      if (conversation.userInput?.requestId === params.requestId) this.expireQuestion(conversation);
      return;
    }
    if (method === "thread/tokenUsage/updated") {
      conversation.tokenUsage = { used: params.tokenUsage.last.totalTokens, limit: params.tokenUsage.modelContextWindow }; return;
    }
    const turnId = params.turnId ?? params.turn?.id;
    if (!turnId) return;
    let turn = conversation.turns.find(turn => turn.id === turnId);
    if (!turn) { turn = { id: turnId, status: "inProgress", items: [] }; conversation.turns.push(turn); }
    if (method === "turn/started" || method === "turn/completed") {
      turn.status = params.turn.status;
      if (method === "turn/started") { const scope = this.scopes.get(params.threadId); if (scope) scope.turnId = turnId; }
      else { this.display.cancel(params.threadId); this.scopes.delete(params.threadId); if (conversation.userInput?.turnId === turnId) this.expireQuestion(conversation); }
      if (params.turn.error) turn.error = params.turn.error.message;
    } else if (method === "item/started" || method === "item/completed") {
      const item = itemFrom(params.item);
      if (item) { const index = turn.items.findIndex(value => value.id === item.id); if (index < 0) turn.items.push(item); else turn.items[index] = item; }
    } else if (["item/agentMessage/delta", "item/reasoning/summaryTextDelta", "item/plan/delta"].includes(method)) {
      let item = turn.items.find(item => item.id === params.itemId);
      if (!item) { item = { id: params.itemId, kind: method.includes("reasoning") ? "reasoning" : method.includes("plan") ? "plan" : "assistant", text: "" }; turn.items.push(item); }
      item.text += params.delta;
    } else if (method === "turn/plan/updated") {
      const item: AssistantConversationItem = { id: `${turnId}-plan`, kind: "plan", text: params.plan.map((step: any) => `${step.status}: ${step.step}`).join("\n") };
      const index = turn.items.findIndex(value => value.id === item.id); if (index < 0) turn.items.push(item); else turn.items[index] = item;
    } else if (method === "error" && !params.willRetry) { this.display.cancel(params.threadId); turn.error = params.error.message; turn.status = "failed"; if (conversation.userInput?.turnId === turnId) this.expireQuestion(conversation); }
  }
}
const CONTEXT = "Litzio read-only context (JSON):\n";
function itemFrom(item: any): AssistantConversationItem | null {
  if (item.type === "userMessage") {
    const references: import("../shared/assistant.ts").AssistantFileReference[] = [];
    const text: string[] = [];
    for (const part of item.content ?? []) {
      if (part.type !== "text") continue;
      // Codex's legacy history flattens all text inputs into one string.
      const marker = part.text.lastIndexOf(CONTEXT);
      if (marker >= 0) {
        try {
          const value = JSON.parse(part.text.slice(marker + CONTEXT.length));
          if (value && Array.isArray(value.folders)) {
            if (Array.isArray(value.references)) references.push(...value.references.filter((file: any) => file && typeof file.path === "string" && typeof file.name === "string" && typeof file.kind === "string"));
            if (marker) text.push(part.text.slice(0, marker));
            continue;
          }
        } catch { /* Ordinary CLI text need not contain valid Litzio context. */ }
      }
      text.push(part.text);
    }
    return { id: item.id, kind: "user", text: text.join("\n"), references };
  }
  if (item.type === "agentMessage") return { id: item.id, kind: "assistant", text: item.text };
  if (item.type === "reasoning") return { id: item.id, kind: "reasoning", text: item.summary.join("\n") };
  if (item.type === "plan") return { id: item.id, kind: "plan", text: item.text };
  if (item.type === "commandExecution") return { id: item.id, kind: "tool", text: item.command, status: item.status };
  if (item.type === "mcpToolCall") return { id: item.id, kind: "tool", text: `${item.server} · ${item.tool}`, status: item.status };
  if (item.type === "dynamicToolCall") return { id: item.id, kind: "tool", text: pluginActivityText(item) ?? [item.namespace, item.tool].filter(Boolean).join(" · "), status: item.success === false ? "failed" : item.status,
    toolResult: { success: item.success ?? null, contentItems: item.contentItems ?? [] } };
  if (item.type === "webSearch") return { id: item.id, kind: "tool", text: item.query };
  if (item.type === "fileChange") return { id: item.id, kind: "tool", text: item.changes.map((change: any) => change.path).join("\n"), status: item.status };
  return null;
}
// Reconstruct the same visible activity from CLI-owned history after resume.
function pluginActivityText(item: any): string | null {
  if (item.tool !== "manage_plugins") return null;
  for (const part of item.contentItems ?? []) {
    if (part.type !== "inputText" || typeof part.text !== "string") continue;
    try {
      const entry = JSON.parse(part.text).activity;
      if (typeof entry?.action === "string" && ["success", "failure"].includes(entry.outcome))
        return `plugins.${entry.action}${typeof entry.id === "string" ? ` (${entry.id})` : ""}: ${entry.outcome}`;
    } catch { /* In-progress calls have no receipt yet. */ }
  }
  return null;
}
function turnFrom(turn: any): AssistantConversationTurn { return { id: turn.id, status: turn.status, items: (turn.items ?? []).map(itemFrom).filter(Boolean), ...(turn.error ? { error: turn.error.message } : {}) }; }

/** Reuse Explorer visibility at each path segment; never include reference content in input. */
function checkedReferences(value: string[], folders: string[], access: FileAccess) {
  if (!Array.isArray(value)) throw new Error("Invalid file references.");
  const scope = folders.length ? new RootAccess(folders) : null;
  const references: import("../shared/assistant.ts").AssistantFileReference[] = [];
  for (const requested of value) {
    if (typeof requested !== "string" || !path.isAbsolute(requested) || !scope) throw new Error("File reference is outside opened folders.");
    const resolved = accessPath(accessPath(requested, scope), access);
    const root = folders.find(folder => { const relative = path.relative(folder, resolved); return relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); });
    if (!root) throw new Error("File reference is outside opened folders.");
    let folder = root;
    const segments = path.relative(root, resolved).split(path.sep);
    let entry;
    for (const [index, name] of segments.entries()) {
      entry = listFolder(root, folder, access).entries.find(file => path.relative(file.path, path.join(folder, name)) === "");
      if (!entry || (index < segments.length - 1 ? entry.kind !== "folder" : entry.kind === "folder")) throw new Error("File reference is unavailable.");
      folder = entry.path;
    }
    if (!references.some(file => path.relative(file.path, resolved) === "")) references.push({ path: resolved, name: entry!.name, kind: entry!.kind });
    if (references.length > 10) throw new Error("At most 10 file references are allowed.");
  }
  return references;
}
