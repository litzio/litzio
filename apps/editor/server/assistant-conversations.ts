import { AssistantAttachments } from "./assistant-attachments.ts";
import { AssistantFileChanges } from "./assistant-file-changes.ts";
import { codexApproval } from "./assistant-approvals.ts";
import { assistantToolFailure, assistantToolResult } from "./assistant-tool-results.ts";
import { AssistantMcp, type HostToolCall, type HostToolResult } from "./assistant-mcp.ts";
import { copilotLogRoot, sessionIdPattern, validateProviderLog } from "./provider-session-log.ts";
import { PLUGIN_AUTHORING_SKILL } from "./plugins/authoring-skill.ts";
import { pluginTools, executePluginTool, pluginOperationTools, executePluginOperationTool } from "./assistant-plugin-tools.ts";
import type { PluginHost } from "./plugins/plugin-host.ts";
import { templateTools, executeTemplateOperation, templateOperations } from "./document-templates.ts";
import { readFileSync, writeFileSync, renameSync, existsSync, statSync, lstatSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { AssistantQuestionRecord, AssistantSubmission, AssistantSubmissionResult, AssistantUserInputAnswers, AssistantSettings, AssistantConversation, AssistantConversationInfo, AssistantConversationInput, AssistantConversationItem, AssistantConversationTurn } from "../shared/assistant.ts";
import type { ProviderConnections } from "./provider-connections.ts";
import { accessPath, RootAccess, type FileAccess } from "./file-access.ts";

import { listFolder, MEDIA_TYPES } from "./document-api.ts";
import { documentFolders, documentTools, executeDocumentTool, type DocumentToolScope } from "./assistant-document-tools.ts";
import { ASSISTANT_INSTRUCTIONS } from "./provider-connections.ts";
import type { SessionNotification, RequestPermissionRequest, RequestPermissionResponse } from "@agentclientprotocol/sdk";
import { COPILOT_EFFORTS, copilotOptions, copilotReasoning, copilotChoices, copilotModelOption } from "./copilot-acp.ts";

import { questionTool } from "./assistant-question-tool.ts";

type ConversationIndexEntry = AssistantConversationInfo & { attachments?: import("./assistant-attachments.ts").AttachmentRecord[]; copilotCliReasoningEffort?: string; questions?: { itemId: string; text: string; question: AssistantQuestionRecord }[] };

/** Providers own message content. Litzio's index also owns correlated question interactions. */
export class AssistantConversations {
  readonly attachments: AssistantAttachments;
  private readonly copilotRoot = copilotLogRoot();
  private fileChanges = new Map<string, AssistantFileChanges>();
  fileChange(id: string, turnId: string, file: string, undo = false, folders?: string[]) {
    const conversation = this.current(id);
    if (conversation.turns.some(turn => turn.status === "inProgress")) throw new Error("Wait for the assistant response to finish.");
    const changes = this.fileChanges.get(id);
    if (!changes) throw new Error("This change is unavailable in this Host session.");
    const result = undo ? changes.undo(turnId, file, folders ?? conversation.folders) : changes.compare(turnId, file, folders ?? conversation.folders);
    if (undo) for (const item of conversation.turns.find(turn => turn.id === turnId)?.items ?? []) item.fileChanges = item.fileChanges?.filter(path => path !== file);
    return result;
  }
  private changes(id: string) {
    let changes = this.fileChanges.get(id);
    if (!changes) { changes = new AssistantFileChanges(this.access); this.fileChanges.set(id, changes); }
    return changes;
  }
  private conversations = new Map<string, AssistantConversation>();
  private pending = new Set<string>();
  private submissions = new Map<string, { receipt: AssistantSubmission; result: Promise<AssistantSubmissionResult>; dispatched: boolean }>();
  submission(id: string): AssistantSubmissionResult {
    const receipt = this.submissions.get(id)?.receipt ?? { id, status: "unknown" as const };
    // Reconcile even when the provider event arrived after a failed/lost RPC response.
    for (const conversation of this.conversations.values()) {
      const turn = conversation.turns.find(turn => turn.items.some(item => item.kind === "user" && item.submissionId === id));
      const item = turn?.items.find(item => item.kind === "user" && item.submissionId === id);
      if (item) {
        receipt.conversationId = conversation.id; receipt.itemId = item.id;
        if (item.userMessageSource !== "host") { receipt.status = "accepted"; delete receipt.error; }
        break;
      }
    }
    return { submission: { ...receipt }, ...(receipt.conversationId ? { conversation: this.conversations.get(receipt.conversationId) } : {}) };
  }
  submit(input: AssistantConversationInput, send: () => Promise<AssistantConversation>): Promise<AssistantSubmissionResult> {
    const id = input.submissionId!;
    if (typeof id !== "string" || !/^[a-zA-Z0-9-]{1,128}$/.test(id)) throw new Error("Invalid submission ID.");
    const previous = this.submissions.get(id);
    if (previous && (previous.dispatched || previous.receipt.status !== "rejected")) return previous.result.then(() => this.submission(id));
    const receipt: AssistantSubmission = { id, status: "pending", ...(input.id ? { conversationId: input.id } : {}) };
    // Register before asynchronous validation. Dispatched IDs are never replayed.
    const result = Promise.resolve().then(send).then(conversation => {
      receipt.status = "accepted";
      receipt.conversationId = conversation.id;
    }, error => {
      if (receipt.status !== "accepted") receipt.status = this.submissions.get(id)?.dispatched ? "unknown" : "rejected";
      receipt.error = (error as Error).message;
    }).then(() => this.submission(id));
    this.submissions.set(id, { receipt, result, dispatched: false });
    return result;
  }
  private dispatch(input: AssistantConversationInput, conversation: AssistantConversation) {
    this.attachments.claim(input.references ?? [], conversation.id);
    const entry = input.submissionId ? this.submissions.get(input.submissionId) : undefined;
    if (entry) { entry.dispatched = true; entry.receipt.conversationId = conversation.id; }
  }
  private scopes = new Map<string, DocumentToolScope & { turnId?: string }>();
  private answers = new Map<string, (answers: AssistantUserInputAnswers) => void>();
  private validators = new Map<string, (answers: AssistantUserInputAnswers) => unknown>();
  private cancellations = new Map<string, () => void>();
  private answerKey(id: string, turnId: string, requestId: string | number) { return JSON.stringify([id, turnId, typeof requestId, requestId]); }
  private closed = false;

  private loaded = new Set<string>();
  constructor(private connection: ProviderConnections, private access: FileAccess, private plugins?: PluginHost) {
    this.attachments = new AssistantAttachments(connection.cwd);
    connection.copilot.on("update", (params: SessionNotification) => this.copilotUpdate(params));
    connection.copilot.on("disconnected", (message: string) => {
      for (const conversation of this.conversations.values()) if (conversation.provider === "copilot") {

        this.loaded.delete(conversation.id); this.scopes.delete(conversation.id); this.mcp.revokeConversation(conversation.id);
        for (const turn of conversation.turns) if (turn.status === "inProgress") { turn.status = "failed"; turn.error = message;  }
        if (this.expireQuestion(conversation)) this.save(conversation);
      }
    });
    connection.copilot.permission = request => this.copilotPermission(request);
    connection.client.userInput = (requestId, params, respond) => {
      const conversation = this.conversations.get(params?.threadId);
      if (!conversation?.turns.some(turn => turn.id === params.turnId && turn.status === "inProgress") || this.answers.has(this.answerKey(conversation.id, params.turnId, requestId)) ||
        !Array.isArray(params.questions) || !params.questions.length || params.questions.some((q: any) =>
          typeof q.id !== "string" || typeof q.header !== "string" || typeof q.question !== "string" ||
          typeof q.isOther !== "boolean" || typeof q.isSecret !== "boolean" ||
          q.options !== null && (!Array.isArray(q.options) || q.options.some((o: any) => typeof o.label !== "string" || typeof o.description !== "string"))) ||
        new Set(params.questions.map((q: any) => q.id)).size !== params.questions.length) throw new Error("Invalid or inactive question.");
      const question: AssistantQuestionRecord = { requestId, turnId: params.turnId, questions: params.questions, delivery: "blocking", status: "pending" };
      conversation.turns.find(turn => turn.id === params.turnId)!.items.push({ id: `question-${typeof requestId}-${requestId}`, kind: "question", text: "", question });
      this.answers.set(this.answerKey(conversation.id, params.turnId, requestId), respond);
      this.refreshQuestion(conversation); this.save(conversation);
    };
    connection.client.approval = (requestId, method, params, respond) => {
      const conversation = this.current(params.threadId);
      const turnId = params.turnId ?? [...conversation.turns].reverse().find(t => t.status === "inProgress")?.id;
      const approval = codexApproval(method, params);
      this.blockingCard(conversation.id, turnId, requestId, approval.questions, answers => respond(approval.result(answers)), () => respond(approval.cancel), approval.result, approval.immediate);
    };
    connection.client.toolCall = params => this.executeTool(params);
    connection.client.on("notification", (method, params) => this.notification(method, params));
    connection.client.on("disconnected", (message: string) => {
      for (const [id, conversation] of this.conversations) if (conversation.provider !== "copilot") { this.loaded.delete(id); this.scopes.delete(id); }
      for (const conversation of this.conversations.values()) if (conversation.provider !== "copilot") {
        for (const turn of conversation.turns) if (turn.status === "inProgress") { turn.status = "failed"; turn.error = message;  }
        if (this.expireQuestion(conversation)) this.save(conversation);
      }
    });
  }
  private executeTool = async (params: HostToolCall): Promise<HostToolResult> => {
    try { return assistantToolResult(await this.dispatchTool(params), params); }
    catch (error) { return {success:false,contentItems:[{type:"inputText",text:JSON.stringify(assistantToolFailure(error,params))}]}; }
  };
  private dispatchTool = async (params: HostToolCall): Promise<HostToolResult> => {
      const scope = this.scopes.get(params?.threadId);
      const active = this.conversations.get(params?.threadId)?.turns.find(turn => turn.id === params.turnId && turn.status === "inProgress");
      if (this.closed || !scope || !active || scope.turnId !== params.turnId || params.namespace != null) throw Object.assign(new Error("No authorized active turn for this tool call."),{errorKind:"forbidden"});
      if (params.tool === questionTool.name) return this.requestQuestion(this.current(params.threadId), active, params.callId, params.arguments);
      if (params.tool === "invoke_plugin_operation" && this.plugins) {
        const result = await executePluginOperationTool(this.plugins, params.arguments, scope);
        const success = !("error" in result && result.error);
        active.items.push(pluginOperationItem(params.callId, !!success, result.activity));
        this.save(this.current(params.threadId));
        return { success: !!success, contentItems: [{ type: "inputText", text: JSON.stringify(result) }] };
      }

      const templateScope = { ...scope, directory: this.connection.templatesDirectory };
      const result = params.tool === "manage_plugins" && this.plugins
        ? await executePluginTool(this.plugins, params.arguments, entry => {
          active.items.push({ id: randomUUID(), kind: "tool", text: `plugins.${entry.action}${entry.id ? ` (${entry.id})` : ""}: ${entry.outcome}`, status: entry.outcome });
        }, scope)
        : params.tool === templateOperations.list.name ? executeTemplateOperation("list", params.arguments, templateScope)
        : params.tool === templateOperations.read.name ? executeTemplateOperation("read", params.arguments, templateScope)
        : params.tool === templateOperations.save.name ? executeTemplateOperation("save", params.arguments, templateScope)
        : executeDocumentTool(params.tool, params.arguments, templateScope);
      const text = JSON.stringify(result);
      return { contentItems: [{ type: "inputText", text }], success: !(result && typeof result === "object" && "error" in result && result.error) };
    };

  get tools() { return [...documentTools, ...templateTools, questionTool, ...(this.plugins ? [...pluginTools, ...pluginOperationTools] : [])]; }
  readonly mcp = new AssistantMcp(() => this.tools, params => this.executeTool(params));
  private get file() { return path.join(this.connection.cwd, "conversations.json"); }
  list(): ConversationIndexEntry[] {
    this.connection.environment();
    return existsSync(this.file) ? JSON.parse(readFileSync(this.file, "utf8")) : [];
  }
  private save(conversation: AssistantConversation) {
    const { id, title, folders, createdAt, updatedAt, provider, permissionMode, permissionFallback } = conversation;
    const questions = conversation.turns.flatMap(turn => turn.items.filter(item => item.question).map(item => ({ itemId: item.id, text: item.text, question: item.question! })));
    const previous = this.list();
    const attachments = this.attachments.owned(id);
    const entries = previous.filter(entry => entry.id !== id);
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify([{ id, title, folders, createdAt, updatedAt, ...(provider ? { provider } : {}), ...(permissionMode ? { permissionMode } : {}), ...(permissionFallback ? { permissionFallback } : {}),
        ...(attachments?.length ? { attachments } : {}),
        ...(questions.length ? { questions } : {}),
        ...(provider === "copilot" && conversation.copilot?.reasoningEffortSource === "cli" ? { copilotCliReasoningEffort: conversation.reasoningEffort } : {}) }, ...entries]) + "\n", { flag: "wx" });
      renameSync(temporary, this.file);
    } finally { if (existsSync(temporary)) unlinkSync(temporary); }
  }
  remove(id: string) {
    if (this.conversations.get(id)?.turns.some(turn => turn.status === "inProgress")) throw new Error("Stop the Assistant response before deleting the conversation.");
    this.attachments.remove(id);
    const entries = this.list().filter(entry => entry.id !== id);
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try { writeFileSync(temporary, JSON.stringify(entries), { flag: "wx" }); renameSync(temporary, this.file); }
    finally { if (existsSync(temporary)) unlinkSync(temporary); }
    this.mcp.revokeConversation(id);
    this.fileChanges.delete(id); this.conversations.delete(id); this.loaded.delete(id); this.scopes.delete(id);
  }
  current(id: string) {
    const conversation = this.conversations.get(id);
    if (!conversation) throw new Error("Resume the conversation first.");
    this.refreshQuestion(conversation);
    return conversation;
  }
  private refreshQuestion(conversation: AssistantConversation) {
    const pending = conversation.turns.flatMap(turn => turn.items).map(item => item.question).filter(q => q?.status === "pending");
    conversation.userInput = pending.find(q => q?.delivery === "blocking") ?? pending[0];
  }
  private restoreQuestions(conversation: AssistantConversation, saved: ConversationIndexEntry["questions"]) {
    for (const record of saved ?? []) {
      const turn = conversation.turns.find(turn => turn.id === record.question.turnId);
      if (!turn) continue;
      let item = turn.items.find(item => item.id === record.itemId);
      if (!item) { item = { id: record.itemId, kind: "question", text: record.text, question: record.question }; turn.items.push(item); }
      else if (item.question && JSON.stringify(item.question.questions) === JSON.stringify(record.question.questions)) item.question = record.question;
      if (item.question?.delivery === "blocking" && item.question.status === "pending") item.question.status = "expired";
      if (item.question?.status === "sending") item.question.status = "unknown";
    }
    for (const item of conversation.turns.flatMap(turn => turn.items)) {
      const reply = item.questionAnswer;
      if (!reply || item.userMessageSource !== "provider-history") continue;
      const question = conversation.turns.find(turn => turn.id === reply.turnId)?.items.find(item => item.question?.requestId === reply.requestId)?.question;
      if (question && validQuestionAnswers(question, reply.answers)) { question.status = "answered"; question.answers = recordedAnswers(question, reply.answers); delete question.error; }
      else delete item.questionAnswer;
    }
    for (const turn of conversation.turns) if (turn.status !== "inProgress") this.expireQuestion(conversation, turn.id);
    this.refreshQuestion(conversation);
    if (conversation.turns.some(turn => turn.items.some(item => item.question))) this.save(conversation);
  }
  async providerLog(id: string, provider: unknown) {
    const info = this.list().find(entry => entry.id === id);
    if (!sessionIdPattern.test(id) || !info || (info.provider ?? "codex") !== provider) return { available: false as const, reason: "unknown" as const };
    try {
      let file: string;
      if (provider === "codex") {
        const result = await this.connection.client.request("thread/read", { threadId: id, includeTurns: false });
        if (result.thread?.id !== id || typeof result.thread.path !== "string") throw new Error("No provider log location.");
        file = result.thread.path;
      } else file = path.join(this.copilotRoot, "session-state", id, "events.jsonl");
      return { available: true as const, id, provider, path: validateProviderLog(file, provider as "codex" | "copilot", id), checkedAt: Date.now() };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      return { available: false as const, reason: code === "ENOENT" ? "missing" as const : code === "EACCES" || code === "EPERM" ? "denied" as const : "unverified" as const };
    }
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
    if (info.provider === "copilot" && this.loaded.has(id)) return this.current(id);
    const conversation: AssistantConversation = { ...info, permissionMode: settings.permissionMode, turns: [], model: settings.model, reasoningEffort: settings.reasoningEffort,
      tokenUsage: this.conversations.get(id)?.tokenUsage, copilotUsage: this.conversations.get(id)?.copilotUsage };
    // Install before the RPC so token-usage notifications during resume are retained.
    this.conversations.set(id, conversation);
    if (info.provider === "copilot") {
      try {
        this.loaded.delete(id);
        const client = await this.connection.copilot.connect();
        if (!this.connection.copilot.loadSession) throw new Error("This Copilot CLI cannot resume sessions. Start a new conversation.");
        const session = await this.connection.copilot.call(() => client.loadSession({ sessionId: id, cwd: this.connection.cwd, mcpServers: this.mcp.servers(id) }), true);
        conversation.model = session.models?.currentModelId ?? settings.model;
        this.connection.copilot.remember({ ...session, sessionId: id });
        conversation.copilot = copilotOptions({ ...session, sessionId: id });
        const reasoning = copilotReasoning(session);
        if (conversation.copilot.reasoningEffortSource === "cli" && !COPILOT_EFFORTS.includes(info.copilotCliReasoningEffort ?? "")) throw new Error("This Copilot conversation has no saved CLI reasoning effort. Start a new conversation.");
        conversation.reasoningEffort = reasoning?.currentValue ?? info.copilotCliReasoningEffort ?? settings.reasoningEffort;
        // Only a completed loadSession replay proves the CLI owns these user messages.
        for (const turn of conversation.turns) for (const item of turn.items) if (item.kind === "user") item.userMessageSource = "provider-history";
        this.loaded.add(id);
        this.restoreQuestions(conversation, info.questions);
        return conversation;
      } catch (error) { this.mcp.revokeConversation(id); throw error; }
    }
    const result = await this.connection.client.request("thread/resume", { threadId: id, cwd: this.connection.cwd,
      approvalPolicy: settings.permissionMode === "full-access" ? "never" : "on-request", sandbox: "read-only", excludeTurns: true });
    // Codex uses paginated histories; hydrate full turns rather than only the latest page.
    const turns: any[] = []; let cursor: string | null = null;
    do {
      const page: { data: any[]; nextCursor: string | null } = await this.connection.client.request("thread/turns/list", { threadId: id, cursor, sortDirection: "asc", itemsView: "full" });
      turns.push(...page.data); cursor = page.nextCursor;
    } while (cursor);
    conversation.turns = turns.map(turn => turnFrom(turn, "provider-history")); conversation.model = result.model ?? settings.model;
    conversation.reasoningEffort = result.reasoningEffort ?? settings.reasoningEffort;
    this.restoreQuestions(conversation, info.questions);
    this.conversations.set(id, conversation);
    this.loaded.add(id);
    return conversation;
  }
  async send(input: AssistantConversationInput, settings: AssistantSettings) {
    if (!input || typeof input.message !== "string" || (!input.message.trim() && !input.references?.length) ||
      typeof input.model !== "string" || typeof input.reasoningEffort !== "string" || !Array.isArray(input.folders)) throw new Error("Invalid conversation input.");
    const existing = input.id ? this.current(input.id) : undefined;
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
    const referenceMode = existing?.turns.some(turn => turn.status === "inProgress") ? existing.permissionMode : settings.permissionMode;
    let references = checkedReferences(input.references ?? [], folders, this.access, referenceMode, this.attachments, input.id);
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
          approvalPolicy: settings.permissionMode === "full-access" ? "never" : "on-request", sandbox: "read-only", ephemeral: false, dynamicTools: this.tools });
        conversation = { id: result.thread.id, title: (input.message.trim() || [...references, ...skills].map(file => file.name).join(", ")).slice(0, 80), folders, createdAt: Date.now(), updatedAt: Date.now(),
          turns: [], provider: "codex", permissionMode: settings.permissionMode, model: input.model, reasoningEffort: input.reasoningEffort };
        this.conversations.set(conversation.id, conversation);
        this.loaded.add(conversation.id);
        this.save(conversation);
      }
      references = checkedReferences(input.references ?? [], folders, this.access, active ? conversation!.permissionMode : settings.permissionMode, this.attachments, conversation.id);
      // Keep all injected text inside the envelope: Codex may flatten text inputs in history.
      const context = { permissionMode: active ? conversation!.permissionMode : settings.permissionMode, conversationId: conversation?.id, userMessage: input.message, ...(input.submissionId ? { submissionId: input.submissionId } : {}), ...(this.plugins ? { pluginAuthoring: PLUGIN_AUTHORING_SKILL } : {}), document: input.document ? { path: input.document.path } : null,  references: [...references, ...skills.map(skill => ({ ...skill, kind: "skill" }))] };
      const messages: object[] = [{ type: "text", text: input.message, text_elements: [] }, { type: "text", text: CONTEXT + JSON.stringify(context), text_elements: [] }];
      messages.push(...skills.map(skill => ({ type: "skill", name: skill.name, path: skill.path })));
      messages.push(...references.filter(file => /\.(png|jpe?g|webp|gif)$/i.test(file.path)).map(file => ({ type: "localImage", path: file.path })));
      this.dispatch(input, conversation);
      if (active) {
        await this.connection.client.request("turn/steer", { threadId: conversation.id, expectedTurnId: active.id, input: messages });
      } else {
        if (input.permissionMode !== undefined && input.permissionMode !== conversation.permissionMode) delete conversation.permissionFallback;
        conversation.model = input.model; conversation.reasoningEffort = input.reasoningEffort; conversation.permissionMode = settings.permissionMode;
        this.scopes.set(conversation.id, { folders: documentFolders(folders, settings.permissionMode, this.access), permissionMode: settings.permissionMode, access: this.access });
        const writableRoots = [...folders];
        if (settings.permissionMode === "opened-folders" && this.plugins) {
          const directory = this.plugins.authoringPath();
          if (directory) writableRoots.push(directory);
        }
        const start = () => {
          checkedReferences(input.references ?? [], folders, this.access, settings.permissionMode, this.attachments, conversation?.id);
          context.permissionMode = settings.permissionMode;
          messages[1] = { type: "text", text: CONTEXT + JSON.stringify(context), text_elements: [] };
          return this.connection.client.request("turn/start", { threadId: conversation!.id, input: messages,
          cwd: this.connection.cwd, model: input.model, effort: input.reasoningEffort, summary: "auto", approvalPolicy: settings.permissionMode === "full-access" ? "never" : "on-request",
          sandboxPolicy: settings.permissionMode === "full-access" ? { type: "dangerFullAccess" } : settings.permissionMode === "opened-folders" ? { type: "workspaceWrite", writableRoots,
            networkAccess: true, excludeTmpdirEnvVar: true, excludeSlashTmp: true } : { type: "readOnly", networkAccess: false } });
        };
        const turnsBeforeStart = conversation.turns.length;
        let result;
        try { result = await start(); }
        catch (error) {
          // This explicit configuration rejection means the turn was not admitted.
          if (settings.permissionMode !== "full-access" || !fullAccessRejected((error as Error).message) || conversation.turns.length !== turnsBeforeStart || conversation.turns.some(turn => turn.status === "inProgress")) throw error;
          settings = { ...settings, permissionMode: "opened-folders" };
          conversation.permissionMode = "opened-folders";
          conversation.permissionFallback = true;
          const scope = this.scopes.get(conversation.id);
          if (scope) {
            scope.permissionMode = "opened-folders";
            scope.folders = documentFolders(folders, "opened-folders", this.access);
          }
          if (this.plugins) { const directory = this.plugins.authoringPath(); if (directory) writableRoots.push(directory); }
          this.save(conversation);
          result = await start();
        }
        const scope = this.scopes.get(conversation.id); if (scope) scope.turnId = result.turn.id;
        if (!conversation.turns.some(turn => turn.id === result.turn.id)) conversation.turns.push(turnFrom(result.turn));
      }
      conversation.folders = folders; conversation.updatedAt = Date.now();
      this.save(conversation);
      return conversation;
    } catch (error) {
      if (conversation && !conversation.turns.some(turn => turn.status === "inProgress")) this.scopes.delete(conversation.id);
      throw new Error(permissionError((error as Error).message));
    } finally { this.pending.delete(key); }
  }
  private async requestQuestion(conversation: AssistantConversation, turn: AssistantConversationTurn, callId: string, input: any) {
    const result = (accepted: boolean, error?: string) => ({ success: accepted, contentItems: [{ type: "inputText", text: JSON.stringify({ accepted, questionId: `question-${callId}`, ...(error ? { error } : {}) }) }] });
    if (typeof callId !== "string" || !callId.trim()) return result(false, "Invalid question call ID.");
    if (!input || Object.keys(input).some(key => !["questions"].includes(key)) || !Array.isArray(input.questions) || input.questions.some((q: any) => !q || Object.keys(q).some(key => !["title", "options"].includes(key)))) return result(false, "Invalid question input.");
    const item = itemFrom({ type: "agentMessage", id: `question-${callId}`, text: "", delivery: "async", questions: input.questions.map((q: any) => ({ ...q, options: q.options ?? null })) }, "provider-live", turn.id)!;
    const question = item.question!;
    if (question.status !== "pending") return result(false, "Invalid question input.");
    turn.items.push(item); this.refreshQuestion(conversation);
    try { this.save(conversation); return result(true); }
    catch (error) {
      question.status = "unknown"; question.error = (error as Error).message;
      this.refreshQuestion(conversation);
      return result(false, question.error);
    }
  }
  async close() {
    this.closed = true;
    this.fileChanges.clear();
    for (const conversation of this.conversations.values()) this.expireQuestion(conversation);
    this.attachments.discardDrafts();
    this.mcp.close();

  }
  private expireQuestion(conversation: AssistantConversation, turnId?: string, requestId?: string | number) {
    let changed = false;
    for (const item of conversation.turns.flatMap(turn => turn.items)) {
      const q = item.question;
      if (q?.status !== "pending" || q.delivery !== "blocking" || turnId !== undefined && q.turnId !== turnId || requestId !== undefined && q.requestId !== requestId) continue;
      q.status = "expired"; changed = true;
      const key = this.answerKey(conversation.id, q.turnId, q.requestId);
      this.answers.delete(key);
      try { this.cancellations.get(key)?.(); } catch { /* Provider already disconnected. */ }
      this.cancellations.delete(key); this.validators.delete(key);
    }
    this.refreshQuestion(conversation);
    return changed;
  }
  expireProviderQuestions(provider: AssistantSettings["provider"]) {
    for (const conversation of this.conversations.values()) if ((conversation.provider ?? "codex") === provider && this.expireQuestion(conversation)) this.save(conversation);
  }
  answer(id: string, turnId: string, requestId: string | number, answers: AssistantUserInputAnswers) {
    const conversation = this.current(id), question = conversation.turns.find(turn => turn.id === turnId)?.items.find(item => item.question?.requestId === requestId)?.question;
    const key = this.answerKey(id, turnId, requestId), respond = this.answers.get(key);
    if (!question || question.status !== "pending" || question.delivery === "blocking" && !respond) throw new Error("Question expired.");
    if (!validQuestionAnswers(question, answers)) throw new Error("Invalid question answers.");
    if (question.delivery === "async") return this.answerAsync(conversation, question, answers);
    this.validators.get(key)?.(answers);
    question.status = "answered";
    question.answers = recordedAnswers(question, answers);
    this.answers.delete(key); this.cancellations.delete(key); this.validators.delete(key); this.refreshQuestion(conversation);
    try { respond!(answers); this.save(conversation); }
    catch (error) { question.status = "unknown"; question.error = (error as Error).message; throw error; }
    return conversation;
  }
  private async answerAsync(conversation: AssistantConversation, question: AssistantQuestionRecord, answers: AssistantUserInputAnswers) {
    question.status = "sending"; question.answers = recordedAnswers(question, answers); this.refreshQuestion(conversation);
    try {
      this.save(conversation);
      const message = QUESTION_ANSWER_CONTEXT + JSON.stringify({ requestId: question.requestId, turnId: question.turnId, questions: question.questions, answers });
      await this.send({ id: conversation.id, message, folders: conversation.folders, model: conversation.model, reasoningEffort: conversation.reasoningEffort },
        { provider: conversation.provider ?? "codex", permissionMode: conversation.permissionMode ?? "read-only", model: conversation.model, reasoningEffort: conversation.reasoningEffort });
    question.status = "answered"; this.save(conversation);
      return conversation;
    } catch (error) {
      question.status = "unknown"; question.error = (error as Error).message;
      try { this.save(conversation); } catch { /* Keep the in-memory uncertainty; never replay the answer. */ }
      throw error;
    }
  }
  async interrupt(id: string) {
    const conversation = this.current(id), turn = conversation.turns.find(turn => turn.status === "inProgress");
    this.expireQuestion(conversation);
    this.save(conversation);

    if (turn && conversation.provider === "copilot") {
      this.mcp.endTurn(id);
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
    if (conversation && !this.loaded.has(conversation.id)) {
      // A running ACP process already owns the session and its MCP endpoint.
      // Retain the snapshot object held by callers while rebuilding provider-owned content.
      const previous = conversation;
      const restored = await this.resume(previous.id, settings, settings.permissionMode);
      // Some ACP implementations replay no history; retain the admitted snapshot then.
      if (!restored.turns.length) restored.turns = previous.turns;
      Object.assign(previous, restored);
      conversation = previous; this.conversations.set(previous.id, previous);
    }
    const client = await acp.connect();
    const lease = conversation ? this.mcp.lease(conversation.id) : this.mcp.create();
    try {
      if (!conversation) {
        const session = acp.remember(await acp.call(() => client.newSession({ cwd: this.connection.cwd, mcpServers: lease.servers }), true));
        conversation = { id: session.sessionId, provider: "copilot", title: (input.message.trim() || references.map(file => file.name).join(", ")).slice(0, 80),
          folders, createdAt: Date.now(), updatedAt: Date.now(), permissionMode: settings.permissionMode, turns: [], model: input.model, reasoningEffort: input.reasoningEffort, copilot: copilotOptions(session) };
        this.conversations.set(conversation.id, conversation); this.loaded.add(conversation.id);
      }
      const id = conversation.id;
      this.mcp.bind(lease, id);
      const session = acp.sessions.get(id)!;
      const modelOption = copilotModelOption(session);
      try {
        if (modelOption) {
          const result = await acp.call(() => client.setSessionConfigOption({ sessionId: id, configId: modelOption.id, value: input.model }));
          session.configOptions = result.configOptions;
        } else await acp.call(() => client.unstable_setSessionModel({ sessionId: id, modelId: input.model }));
        conversation.model = input.model;
        const reasoning = copilotReasoning(session);
        if (reasoning) {
          if (!copilotChoices(reasoning).some(value => value.value === input.reasoningEffort)) throw new Error("Invalid Copilot reasoning effort for this session.");
          const result = await acp.call(() => client.setSessionConfigOption({ sessionId: id, configId: reasoning.id, value: input.reasoningEffort }));
          session.configOptions = result.configOptions;
        } else if (!modelOption && source === "cli" && acp.reasoningEffort !== input.reasoningEffort) throw new Error("Start a new conversation to change Copilot reasoning effort.");
        const options = copilotOptions(session);
        const mode = input.mode ?? options.modes.find(mode => /(?:^|#)agent$/.test(mode.id))?.id;
        if (mode) {
          if (!options.modes.some(value => value.id === mode)) throw new Error("Invalid Copilot session mode.");
          await acp.call(() => client.setSessionMode({ sessionId: id, modeId: mode }));
          if (session.modes) session.modes.currentModeId = mode;
          const modeConfig = session.configOptions?.find(option => option.category === "mode");
          if (modeConfig?.type === "select") modeConfig.currentValue = mode;
        }
        // Paseo's Allow All is Agent/Plan plus allow_all=on, not an autopilot mode.
        const allowAll = session.configOptions?.find(option => option.id === "allow_all");
        if (allowAll?.type === "select") {
          const result = await acp.call(() => client.setSessionConfigOption({ sessionId: id, configId: allowAll.id, value: fullAccess ? "on" : "off" }));
          session.configOptions = result.configOptions;
        }
      } finally {
        // A successful model change is real even if a later setting is rejected.
        // Keep polling truthful so the user can choose from the new model's options.
        conversation.copilot = copilotOptions(session);
        conversation.reasoningEffort = copilotReasoning(session)?.currentValue ?? conversation.reasoningEffort;
      }
      references = checkedReferences(input.references ?? [], folders, this.access, settings.permissionMode, this.attachments, conversation?.id);
      const context = { permissionMode: settings.permissionMode, conversationId: conversation?.id, userMessage: input.message, ...(input.submissionId ? { submissionId: input.submissionId } : {}), ...(this.plugins ? { pluginAuthoring: PLUGIN_AUTHORING_SKILL } : {}), document: input.document ? { path: input.document.path } : null,  references };
      const turn: AssistantConversationTurn = { id: randomUUID(), status: "inProgress", items: [{ id: randomUUID(), kind: "user", userMessageSource: "host", ...(input.submissionId ? { submissionId: input.submissionId } : {}), text: input.message, references }] };
      this.dispatch(input, conversation);
      conversation.turns.push(turn); conversation.model = input.model; conversation.reasoningEffort = copilotReasoning(session)?.currentValue ?? input.reasoningEffort;
      conversation.folders = folders; conversation.updatedAt = Date.now(); conversation.permissionMode = settings.permissionMode;
      lease.turnId = turn.id;
      this.scopes.set(id, { folders: documentFolders(folders, settings.permissionMode, this.access), access: this.access, permissionMode: settings.permissionMode, turnId: turn.id });
      this.save(conversation);
      // ACP prompt resolves at turn completion; return the snapshot immediately for existing panel polling.
      const failedPrompt = (message: string) => {
        turn.status = "failed"; turn.error = message;
        // Turn completion failure does not revoke admission.
      };
      void Promise.resolve().then(() => client.prompt({ sessionId: id, prompt: [{ type: "text", text: ASSISTANT_INSTRUCTIONS.replace("Images are also supplied as localImage inputs.", "Pasted images are also supplied as ACP image inputs.") + "\nUse request_litzio_user_input through the Litzio Host MCP server for structured questions. Native ACP question extensions are not supported.\nUser message:\n" + input.message + "\n\n" + CONTEXT + JSON.stringify(context) }, ...this.attachments.images(references)] })).then(result => {
        if (result.usage) {
          const { totalTokens, inputTokens, outputTokens, thoughtTokens, cachedReadTokens, cachedWriteTokens } = result.usage;
          conversation!.copilotUsage = { ...conversation!.copilotUsage, prompt: { totalTokens, inputTokens, outputTokens, thoughtTokens, cachedReadTokens, cachedWriteTokens } };
        }
        if (turn.status === "inProgress") {
          turn.status = result.stopReason === "cancelled" ? "interrupted" : result.stopReason === "end_turn" ? "completed" : "failed";
          if (turn.status === "failed") failedPrompt(`Copilot stopped: ${result.stopReason}`);
        }
      }, error => failedPrompt(typeof error?.message === "string" ? error.message : String(error))).finally(() => {

        if (lease.turnId === turn.id) lease.turnId = undefined;
        if (this.scopes.get(id)?.turnId === turn.id) this.scopes.delete(id);
        if (this.expireQuestion(conversation!, turn.id)) this.save(conversation!);
      });
      return conversation;
    } catch (error) {
      // Configuration rejection does not unload a successfully created session.
      // Keep its endpoint idle so a corrected send can reuse the loaded session.
      if (!lease.conversationId) this.mcp.revoke(lease);
      else lease.turnId = undefined;
      throw error;
    }
  }
  private async prepareCopilotLaunch(effort: string, settings: AssistantSettings) {
    const acp = this.connection.copilot, fullAccess = settings.permissionMode === "full-access";
    if ((acp.reasoningEffort !== effort || acp.fullAccess !== fullAccess) && [...this.conversations.values()].some(value => value.provider === "copilot" && value.turns.some(turn => turn.status === "inProgress"))) throw new Error("Stop the Copilot response before changing launch settings.");
    await acp.useLaunchSettings(effort, fullAccess);
  }
  private blockingCard(id: string, turnId: string, requestId: string | number, questions: AssistantQuestionRecord["questions"], respond: (answers: AssistantUserInputAnswers) => void, cancel: () => void, validate?: (answers: AssistantUserInputAnswers) => unknown, approval = true) {
    const conversation = this.current(id), turn = conversation.turns.find(t => t.id === turnId && t.status === "inProgress");
    const key = this.answerKey(id, turnId, requestId);
    if (!turn || this.answers.has(key)) throw new Error("Invalid or inactive approval request.");
    const question: AssistantQuestionRecord = { requestId, turnId, questions, delivery: "blocking", status: "pending", approval };
    turn.items.push({ id: `approval-${typeof requestId}-${requestId}`, kind: "question", text: "", question });
    this.answers.set(key, respond); this.cancellations.set(key, cancel);
    if (validate) this.validators.set(key, validate);
    this.refreshQuestion(conversation); this.save(conversation);
  }
  private copilotPermission(request: RequestPermissionRequest): RequestPermissionResponse | Promise<RequestPermissionResponse> {
    const scope = this.scopes.get(request.sessionId), tool = request.toolCall;
    const active = this.conversations.get(request.sessionId)?.turns.some(turn => turn.id === scope?.turnId && turn.status === "inProgress");
    const reading = tool.kind === "read" || tool.kind === "search";
    let allowed = !!scope && !!active && tool.kind !== "execute" && (reading || scope.permissionMode === "opened-folders");
    if (!tool.locations?.length) allowed = false;
    if (allowed) try {
      for (const location of tool.locations!) {
        if (!path.isAbsolute(location.path) || !scope!.folders) throw new Error("No opened folder scope.");
        accessPath(accessPath(location.path, scope!.folders, !reading), this.access, !reading);
      }
    } catch { allowed = false; }
    const fullAccess = !!scope && !!active && scope.permissionMode === "full-access";
    const network = !!scope && !!active && scope.permissionMode === "opened-folders" && tool.kind === "fetch" && !tool.locations?.length;
    const hostTool = !!scope && !!active && tool.kind !== "execute" && this.mcp.permission(request.sessionId, tool.rawInput);
    const option = allowed || network || fullAccess || hostTool ? request.options.find(option => option.kind === "allow_once") ?? (fullAccess ? request.options.find(option => option.kind === "allow_always") : undefined) : undefined;
    if (option) return { outcome: { outcome: "selected", optionId: option.optionId } };
    if (!active) return { outcome: { outcome: "cancelled" } };
    return new Promise(resolve => {
      const choices: { label: string; description: string }[] = request.options.map((option, index) => ({ label: `${index + 1}. ${option.name}`, description: "" }));
      choices.push({ label: "Reject", description: "" });
      this.blockingCard(request.sessionId, scope!.turnId!, `approval-${randomUUID()}`, [{ id: "decision", header: "Permission request", question: [tool.title, ...(tool.locations ?? []).map(location => location.path)].filter(Boolean).join("\n"), isOther: false, isSecret: false, options: choices }], answers => {
        const selected = choices.findIndex(choice => choice.label === answers.decision!.answers[0]);
        const option = request.options[selected];
        resolve(option ? { outcome: { outcome: "selected", optionId: option.optionId } } : { outcome: { outcome: "cancelled" } });
      }, () => resolve({ outcome: { outcome: "cancelled" } }));
    });
  }
  private copilotUpdate({ sessionId, update }: SessionNotification) {
    const conversation = this.conversations.get(sessionId); if (!conversation || conversation.provider !== "copilot") return;
    if (update.sessionUpdate === "usage_update") {
      conversation.tokenUsage = { used: update.used, limit: update.size };
      if (update.cost) conversation.copilotUsage = { ...conversation.copilotUsage, cost: { amount: update.cost.amount, currency: update.cost.currency } };
      return;
    }
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
      if (item) {
        conversation.turns.push({ id: randomUUID(), status: "completed", items: [item] });
      }
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
      item.work = { ...item.work, kind: update.kind ?? item.work?.kind ?? "tool" };
      if (update.content) Object.assign(item.work, boundedWork(update.content.map((part: any) => part.type === "content" && part.content?.type === "text" ? part.content.text : part.type === "diff" ? `${part.path}\n${part.newText}` : "").filter(Boolean).join("\n")));
      const paths = update.locations?.map((location: any) => location.path).filter((file: string) => !item!.text.includes(file));
      if (paths?.length) item.text += " · " + paths.join(", ");
      if (turn.status === "inProgress" && this.scopes.get(sessionId)?.turnId === turn.id) {
        const files = this.changes(sessionId).copilot(turn.id, item.id, update.content, update.status === "completed", [...(this.scopes.get(sessionId)?.folders?.roots ?? [])]);
        if (files.length) item.fileChanges = [...new Set([...(item.fileChanges ?? []), ...files])];
      }
      if (update.status) item.status = update.status === "in_progress" ? "inProgress" : update.status;
    }
  }

  private notification(method: string, params: any) {
    const conversation = this.conversations.get(params.threadId);
    if (!conversation) return;
    if (method === "serverRequest/resolved") {
      for (const q of conversation.turns.flatMap(t => t.items).map(i => i.question)) if (q && q.requestId === params.requestId) this.cancellations.delete(this.answerKey(conversation.id, q.turnId, q.requestId));
      if (this.expireQuestion(conversation, undefined, params.requestId)) this.save(conversation);
      return;
    }
    if (method === "thread/tokenUsage/updated") {
      conversation.tokenUsage = { used: params.tokenUsage.last.totalTokens, limit: params.tokenUsage.modelContextWindow };

      return;
    }
    const turnId = params.turnId ?? params.turn?.id;
    if (!turnId) return;
    let turn = conversation.turns.find(turn => turn.id === turnId);
    if (!turn) { turn = { id: turnId, status: "inProgress", items: [] }; conversation.turns.push(turn); }
    if (method === "turn/started" || method === "turn/completed") {
      turn.status = params.turn.status;
      if (method === "turn/started") { const scope = this.scopes.get(params.threadId); if (scope) scope.turnId = turnId; }
      else {  this.scopes.delete(params.threadId); this.expireQuestion(conversation, turnId); }
      if (params.turn.error) turn.error = permissionError(params.turn.error.message);
    } else if (method === "item/started" || method === "item/completed") {
      const item = itemFrom(params.item, "provider-live", turn.id);
      if (item && params.item.type === "fileChange" && method === "item/completed" && params.item.status === "completed" && turn.status === "inProgress" && this.scopes.get(conversation.id)?.turnId === turn.id) {
        item.fileChanges = params.item.changes.flatMap((change: any) => {
          const target = this.changes(conversation.id).codex(turn.id, change, [...(this.scopes.get(conversation.id)?.folders?.roots ?? [])]);
          return target ? [target] : [];
        });
      }
      if (item) {
        if (item.questionAnswer) {
          const reply = item.questionAnswer;
          const origin = conversation.turns.find(t => t.id === reply.turnId)?.items.find(i => i.question?.requestId === reply.requestId)?.question;
          if (!origin || !validQuestionAnswers(origin, reply.answers)) delete item.questionAnswer;
        }
        const index = turn.items.findIndex(value => value.id === item.id);
        if (index < 0) turn.items.push(item);
        else { if (item.question && turn.items[index]!.question) item.question = turn.items[index]!.question; turn.items[index] = item; }
        if (turn.status !== "inProgress") this.expireQuestion(conversation, turnId);
        this.refreshQuestion(conversation);
        if (item.question) this.save(conversation);
      }
    } else if (["item/agentMessage/delta", "item/reasoning/summaryTextDelta", "item/plan/delta"].includes(method)) {
      let item = turn.items.find(item => item.id === params.itemId);
      if (!item) { item = { id: params.itemId, kind: method.includes("reasoning") ? "reasoning" : method.includes("plan") ? "plan" : "assistant", text: "" }; turn.items.push(item); }
      item.text += params.delta;
    } else if (method === "item/commandExecution/outputDelta") {
      const item = turn.items.find(item => item.id === params.itemId);
      if (item?.work && !item.work.truncated) Object.assign(item.work, boundedWork((item.work.detail ?? "") + params.delta));
    } else if (method === "turn/plan/updated") {
      const item: AssistantConversationItem = { id: `${turnId}-plan`, kind: "plan", text: params.plan.map((step: any) => `${step.status}: ${step.step}`).join("\n") };
      const index = turn.items.findIndex(value => value.id === item.id); if (index < 0) turn.items.push(item); else turn.items[index] = item;
    } else if (method === "error" && !params.willRetry) { turn.error = permissionError(params.error.message); turn.status = "failed"; this.expireQuestion(conversation, turnId); }

    if ((method === "turn/completed" || method === "error" && !params.willRetry) && conversation.turns.some(turn => turn.items.some(item => item.question))) this.save(conversation);
  }
}
const CONTEXT = "Litzio read-only context (JSON):\n";
const QUESTION_ANSWER_CONTEXT = "Litzio question answers (JSON):\n";
function recordedAnswers(question: AssistantQuestionRecord, answers: AssistantUserInputAnswers): AssistantUserInputAnswers {
  return Object.fromEntries(question.questions.map(q => [q.id, { answers: q.isSecret ? ["••••"] : answers[q.id]!.answers }]));
}
function validQuestionAnswers(question: AssistantQuestionRecord, answers: AssistantUserInputAnswers) {
  return !!answers && Object.keys(answers).length === question.questions.length && question.questions.every(q => {
    if (!Object.hasOwn(answers, q.id)) return false;
    const answer = answers[q.id], values = answer && Object.hasOwn(answer, "answers") ? answer.answers : undefined;
    return Array.isArray(values) && values.length === 1 && typeof values[0] === "string" && !!values[0].trim() &&
      (!q.options?.length || q.isOther || q.options.some(option => option.label === values[0]));
  });
}
// Bounded display payload per step.
function boundedWork(text: string) {
  return { detail: text.slice(0, 16_000), truncated: text.length > 16_000 };
}
function itemFrom(item: any, userMessageSource: AssistantConversationItem["userMessageSource"] = "provider-live", turnId = ""): AssistantConversationItem | null {
  if (item.type === "userMessage") {
    const references: import("../shared/assistant.ts").AssistantFileReference[] = [];
    const text: string[] = [];
    let submissionId: string | undefined;
    for (const part of item.content ?? []) {
      if (part.type !== "text") continue;
      // Codex's legacy history flattens all text inputs into one string.
      const marker = part.text.lastIndexOf(CONTEXT);
      if (marker >= 0) {
        try {
          const value = JSON.parse(part.text.slice(marker + CONTEXT.length));
          if (value && typeof value.userMessage === "string") {
            if (typeof value.submissionId === "string") submissionId = value.submissionId;
            if (Array.isArray(value.references)) references.push(...value.references.filter((file: any) => file && typeof file.path === "string" && typeof file.name === "string" && typeof file.kind === "string"));
            if (typeof value.userMessage === "string") { text.length = 0; text.push(value.userMessage); }
            else if (marker) text.push(part.text.slice(0, marker));
            continue;
          }
        } catch { /* Ordinary CLI text need not contain valid Litzio context. */ }
      }
      text.push(part.text);
    }
    const message = text.join("\n");
    let questionAnswer: AssistantConversationItem["questionAnswer"];
    if (message.startsWith(QUESTION_ANSWER_CONTEXT)) {
      try {
        const reply = JSON.parse(message.slice(QUESTION_ANSWER_CONTEXT.length));
        if (reply && ["string", "number"].includes(typeof reply.requestId) && typeof reply.turnId === "string" && reply.answers && typeof reply.answers === "object" && !Array.isArray(reply.answers) && Object.values(reply.answers).every((answer: any) => answer && Array.isArray(answer.answers) && answer.answers.length === 1 && typeof answer.answers[0] === "string")) questionAnswer = reply;
      } catch { /* Ordinary text stays readable. */ }
    }
    return { id: item.id, kind: "user", userMessageSource, ...(submissionId ? { submissionId } : {}), ...(questionAnswer ? { questionAnswer } : {}), text: message, references };
  }
  if (item.type === "agentMessage" && item.delivery === "async" && item.questions != null) {
    const sourceQuestions: AssistantQuestionRecord["sourceQuestions"] = item.questions;
    const valid = Array.isArray(sourceQuestions) && sourceQuestions.length > 0 && sourceQuestions.every(q => q && typeof q.title === "string" && q.title.trim() && (q.options === null || Array.isArray(q.options) && q.options.length > 0 && q.options.every(o => typeof o === "string" && o.trim())));
    const question: AssistantQuestionRecord = { requestId: item.id, turnId, delivery: "async", status: valid ? "pending" : "unknown",
      ...(valid ? { sourceQuestions } : { error: "The provider question could not be displayed." }),
      questions: valid ? sourceQuestions!.map((q, index) => ({ id: String(index), header: "", question: q.title, isOther: true, isSecret: false, options: q.options?.map(label => ({ label, description: "" })) ?? null })) : [] };
    return { id: item.id, kind: "question", text: item.text ?? "", question };
  }
  if (item.type === "agentMessage") return { id: item.id, kind: "assistant", text: item.text };
  if (item.type === "reasoning") return { id: item.id, kind: "reasoning", text: item.summary.join("\n") };
  if (item.type === "plan") return { id: item.id, kind: "plan", text: item.text };
  if (item.type === "commandExecution") return { id: item.id, kind: "tool", text: item.command, status: typeof item.exitCode === "number" && item.exitCode !== 0 ? "failed" : item.status, work: { kind: "execute", ...boundedWork(item.aggregatedOutput ?? "") } };
  if (item.type === "mcpToolCall") return { id: item.id, kind: "tool", text: `${item.server} · ${item.tool}`, status: item.status, work: { kind: "tool", ...boundedWork(JSON.stringify(item.arguments ?? {})) } };
  if (item.type === "dynamicToolCall" && item.tool === "invoke_plugin_operation") {
    for (const part of item.contentItems ?? []) {
      try {
        if (part.type === "inputText") return pluginOperationItem(item.id, item.success, JSON.parse(part.text).activity);
      } catch { /* In-progress calls have no activity yet. */ }
    }
    return { id: item.id, kind: "tool", text: "invoke_plugin_operation", status: item.status };
  }
  if (item.type === "dynamicToolCall") return { id: item.id, kind: "tool", text: pluginActivityText(item) ?? [item.namespace, item.tool].filter(Boolean).join(" · "), status: item.success === false ? "failed" : item.status,
    work: { kind: "tool", ...boundedWork(JSON.stringify(item.arguments ?? {})) }, toolResult: displayToolResult({ success: item.success ?? null, contentItems: item.contentItems ?? [] }) };
  if (item.type === "webSearch") return { id: item.id, kind: "tool", text: item.query };
  if (item.type === "fileChange") return { id: item.id, kind: "tool", text: item.changes.map((change: any) => change.path).join("\n"), status: item.status, work: { kind: "edit" } };
  return null;
}
/** Keep only invocation metadata in app activity, including provider history restoration. */
function pluginOperationItem(id: string, success: boolean | null, entry: any): AssistantConversationItem {
  const activity = { operation: entry?.operation, outcome: entry?.outcome, at: entry?.at, receipt: entry?.receipt };
  return { id, kind: "tool", text: `invoke_plugin_operation${activity.operation ? ` (${activity.operation})` : ""}: ${activity.outcome ?? "pending"}`,
    status: success === false ? "failed" : "completed", toolResult: { success, contentItems: [{ type: "inputText", text: JSON.stringify({ activity }) }] } };
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
function turnFrom(turn: any, userMessageSource: AssistantConversationItem["userMessageSource"] = "provider-live"): AssistantConversationTurn { return { id: turn.id, status: turn.status, items: (turn.items ?? []).map((item: any) => itemFrom(item, userMessageSource, turn.id)).filter(Boolean), ...(turn.error ? { error: turn.error.message } : {}) }; }

/** Restricted turns reuse Explorer visibility; full access still rejects links and respects Host Roots. */
function checkedReferences(value: string[], folders: string[], access: FileAccess, permissionMode: string | undefined, attachments?: AssistantAttachments, owner?: string) {
  if (!Array.isArray(value)) throw new Error("Invalid file references.");
  const scope = folders.length ? new RootAccess(folders) : null;
  const references: import("../shared/assistant.ts").AssistantFileReference[] = [];
  for (const requested of value) {
    const attachment = attachments?.reference(requested, owner);
    if (attachment) { if (!references.some(file => file.path === attachment.path)) references.push(attachment); continue; }
    if (permissionMode === "full-access") {
      if (typeof requested !== "string" || !path.isAbsolute(requested)) throw new Error("Invalid file reference path.");
      const resolved = accessPath(requested, access);
      for (let current = resolved; ; current = path.dirname(current)) {
        if (lstatSync(current).isSymbolicLink()) throw new Error("File reference is unavailable.");
        if (path.dirname(current) === current) break;
      }
      if (!statSync(resolved).isFile()) throw new Error("File reference is unavailable.");
      const extension = path.extname(resolved).toLowerCase();
      const kind = extension === ".md" || extension === ".txt" ? "document" : Object.hasOwn(MEDIA_TYPES, extension) ? "image" : "file";
      if (!references.some(file => path.relative(file.path, resolved) === "")) references.push({ path: resolved, name: path.basename(resolved), kind });
      continue;
    }
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
  }
  return references;
}

function fullAccessRejected(message: string): boolean {
  return /invalid.*sandbox_mode.*DangerFullAccess.*not in the allowed set/s.test(message);
}
function permissionError(message: string): string {
  return fullAccessRejected(message)
    ? "Your organization does not allow Full access. Choose Opened folders or Read-only and send again."
    : message;
}

/** UI history never needs large model-facing tool payloads. Apply again at the transport boundary
 * for already-loaded conversations; provider-owned history and model results remain intact. */
function displayToolResult(result:NonNullable<AssistantConversationItem["toolResult"]>) {
  const bytes=Buffer.byteLength(JSON.stringify(result.contentItems),"utf8");
  if(bytes<=16*1024)return result;
  // Creation cards use the small receipt, never the returned source, for Open/Undo.
  const receipts=result.contentItems.flatMap<any>(part=>{
    if(part.type!=="inputText" || !part.text)return [];
    try {const value=JSON.parse(part.text);
      if(value.workspace && value.documentRevision && (value.material || value.images))return [{workspace:value.workspace,documentRevision:value.documentRevision,contentRevision:value.contentRevision,
        ...(value.material ? {material:{pages:value.material.pages,items:value.material.items.map((item:any)=>({self_ref:item.self_ref}))}} : {runId:value.runId,images:value.images})}];
      return typeof value.path==="string" && /^[a-f0-9]{64}$/.test(value.revision) ? [{path:value.path,revision:value.revision,identity:value.identity}] : [];} catch {return [];}
  });
  return {...result,contentItems:[...receipts.map(value=>({type:"inputText",text:JSON.stringify(value)})),{type:"inputText",text:JSON.stringify({omitted:true,bytes,summary:"Tool result retained in provider history; omitted from display."})}]};
}
export function conversationForDisplay(conversation:AssistantConversation):AssistantConversation {
  let changed=false;
  const turns=conversation.turns.map(turn=>({...turn,items:turn.items.map(item=>{
    if(item.references?.length) {
      changed=true;
      item={...item,references:item.references.map(file=>({...file,unavailable:!existsSync(file.path)}))};
    }
    if(!item.toolResult)return item;
    const result=displayToolResult(item.toolResult);if(result===item.toolResult)return item;
    changed=true;return {...item,toolResult:result};
  })}));
  return changed ? {...conversation,turns} : conversation;
}
