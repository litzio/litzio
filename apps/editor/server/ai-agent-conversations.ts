import { readFileSync, writeFileSync, renameSync, existsSync, statSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { AiUserInputAnswers, AiAgentSettings, AiConversation, AiConversationInfo, AiConversationInput, AiConversationItem, AiConversationTurn } from "@litzio/plugin-api/ai";
import type { AiAgentConnection } from "./ai-agent-connection.ts";
import { accessPath, RootAccess, type FileAccess } from "./file-access.ts";

import { listFolder } from "./document-api.ts";
import { documentTools, executeDocumentTool, type DocumentToolScope } from "./agent-document-tools.ts";

/** Litzio persists only its history index. Codex owns all conversation content. */
export class AiAgentConversations {
  private conversations = new Map<string, AiConversation>();
  private pending = new Set<string>();
  private scopes = new Map<string, DocumentToolScope & { turnId?: string }>();
  private answers = new Map<string, (answers: AiUserInputAnswers) => void>();
  private loaded = new Set<string>();
  constructor(private connection: AiAgentConnection, private access: FileAccess) {
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
    connection.client.toolCall = params => {
      const scope = this.scopes.get(params?.threadId);
      const active = this.conversations.get(params?.threadId)?.turns.find(turn => turn.id === params.turnId && turn.status === "inProgress");
      if (!scope || !active || scope.turnId !== params.turnId || params.namespace != null) throw new Error("No authorized active turn for this tool call.");
      const result = executeDocumentTool(params.tool, params.arguments, scope);
      return { contentItems: [{ type: "inputText", text: JSON.stringify(result) }], success: true };
    };
    connection.client.on("notification", (method, params) => this.notification(method, params));
    connection.client.on("disconnected", (message: string) => {
      this.loaded.clear(); this.scopes.clear();
      for (const conversation of this.conversations.values()) this.expireQuestion(conversation);
      for (const conversation of this.conversations.values()) for (const turn of conversation.turns) {
        if (turn.status === "inProgress") { turn.status = "failed"; turn.error = message; }
      }
    });
  }
  private get file() { return path.join(this.connection.cwd, "conversations.json"); }
  list(): AiConversationInfo[] {
    this.connection.environment();
    return existsSync(this.file) ? JSON.parse(readFileSync(this.file, "utf8")) : [];
  }
  private save(conversation: AiConversation) {
    const { id, title, folders, createdAt, updatedAt } = conversation;
    const entries = this.list().filter(entry => entry.id !== id);
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify([{ id, title, folders, createdAt, updatedAt }, ...entries]) + "\n", { flag: "wx" });
      renameSync(temporary, this.file);
    } finally { if (existsSync(temporary)) unlinkSync(temporary); }
  }
  current(id: string) {
    const conversation = this.conversations.get(id);
    if (!conversation) throw new Error("Resume the conversation first.");
    return conversation;
  }
  async resume(id: string, settings: AiAgentSettings) {
    if (typeof id !== "string") throw new Error("Invalid conversation selection.");
    if (this.conversations.get(id)?.turns.some(turn => turn.status === "inProgress")) return this.current(id);
    const info = this.list().find(entry => entry.id === id);
    if (!info) throw new Error("Conversation was not found.");
    const conversation: AiConversation = { ...info, turns: [], model: settings.model, reasoningEffort: settings.reasoningEffort,
      tokenUsage: this.conversations.get(id)?.tokenUsage };
    // Install before the RPC so token-usage notifications during resume are retained.
    this.conversations.set(id, conversation);
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
  async send(input: AiConversationInput, settings: AiAgentSettings) {
    if (!input || typeof input.message !== "string" || (!input.message.trim() && !input.references?.length) ||
      typeof input.model !== "string" || typeof input.reasoningEffort !== "string" || !Array.isArray(input.folders)) throw new Error("Invalid conversation input.");
    const folders = [...new Set(input.folders.map(folder => {
      if (typeof folder !== "string" || !path.isAbsolute(folder)) throw new Error("Invalid opened folder.");
      const resolved = accessPath(folder, this.access);
      if (!statSync(resolved).isDirectory()) throw new Error("Opened folder is unavailable.");
      return resolved;
    }))];
    let references = checkedReferences(input.references ?? [], folders, this.access);
    if (input.document) {
      if (typeof input.document.source !== "string" || typeof input.document.path !== "string") throw new Error("Invalid document context.");
      accessPath(input.document.path, this.access);
    }
    let conversation = input.id ? this.current(input.id) : undefined;
    const key = input.id ?? "new";
    if (this.pending.has(key)) throw new Error("A conversation request is already pending.");
    this.pending.add(key);
    try {
      this.connection.environment();
      if (conversation && !this.loaded.has(conversation.id)) conversation = await this.resume(conversation.id, settings);
      const active = conversation?.turns.find(turn => turn.status === "inProgress");
      if (active && (input.model !== conversation!.model || input.reasoningEffort !== conversation!.reasoningEffort)) throw new Error("Model and reasoning effort are locked while running.");
      if (!active) {
        const models = await this.connection.models();
        if (!models.models.some(model => model.model === input.model && model.supportedReasoningEfforts.some(effort => effort.reasoningEffort === input.reasoningEffort))) throw new Error("Invalid AI model or reasoning effort.");
      }
      if (!conversation) {
        const result = await this.connection.client.request("thread/start", { model: input.model, cwd: this.connection.cwd,
          approvalPolicy: "never", sandbox: "read-only", ephemeral: false, dynamicTools: documentTools });
        conversation = { id: result.thread.id, title: (input.message.trim() || references.map(file => file.name).join(", ")).slice(0, 80), folders, createdAt: Date.now(), updatedAt: Date.now(),
          turns: [], model: input.model, reasoningEffort: input.reasoningEffort };
        this.conversations.set(conversation.id, conversation);
        this.loaded.add(conversation.id);
        this.save(conversation);
      }
      references = checkedReferences(input.references ?? [], folders, this.access);
      const context = { folders, document: input.document ?? null, references };
      const messages: object[] = [{ type: "text", text: input.message, text_elements: [] }, { type: "text", text: CONTEXT + JSON.stringify(context), text_elements: [] }];
      messages.push(...references.filter(file => /\.(png|jpe?g|webp|gif)$/i.test(file.path)).map(file => ({ type: "localImage", path: file.path })));
      if (active) {
        await this.connection.client.request("turn/steer", { threadId: conversation.id, expectedTurnId: active.id, input: messages });
      } else {
        conversation.model = input.model; conversation.reasoningEffort = input.reasoningEffort;
        this.scopes.set(conversation.id, { folders: folders.length ? new RootAccess(folders) : null, writeAccess: settings.writeAccess, access: this.access });
        const result = await this.connection.client.request("turn/start", { threadId: conversation.id, input: messages,
          cwd: this.connection.cwd, model: input.model, effort: input.reasoningEffort, summary: "auto", approvalPolicy: "never",
          sandboxPolicy: settings.writeAccess === "opened-folders" ? { type: "workspaceWrite", writableRoots: folders,
            networkAccess: false, excludeTmpdirEnvVar: true, excludeSlashTmp: true } : { type: "readOnly", networkAccess: false } });
        const scope = this.scopes.get(conversation.id); if (scope) scope.turnId = result.turn.id;
        if (!conversation.turns.some(turn => turn.id === result.turn.id)) conversation.turns.push(turnFrom(result.turn));
      }
      conversation.folders = folders; conversation.updatedAt = Date.now();
      this.save(conversation);
      return conversation;
    } finally { this.pending.delete(key); }
  }
  private expireQuestion(conversation: AiConversation) {
    delete conversation.userInput; this.answers.delete(conversation.id);
  }
  answer(id: string, turnId: string, requestId: string | number, answers: AiUserInputAnswers) {
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
    if (turn) await this.connection.client.request("turn/interrupt", { threadId: id, turnId: turn.id });
    return conversation;
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
      else { this.scopes.delete(params.threadId); if (conversation.userInput?.turnId === turnId) this.expireQuestion(conversation); }
      if (params.turn.error) turn.error = params.turn.error.message;
    } else if (method === "item/started" || method === "item/completed") {
      const item = itemFrom(params.item);
      if (item) { const index = turn.items.findIndex(value => value.id === item.id); if (index < 0) turn.items.push(item); else turn.items[index] = item; }
    } else if (["item/agentMessage/delta", "item/reasoning/summaryTextDelta", "item/plan/delta"].includes(method)) {
      let item = turn.items.find(item => item.id === params.itemId);
      if (!item) { item = { id: params.itemId, kind: method.includes("reasoning") ? "reasoning" : method.includes("plan") ? "plan" : "assistant", text: "" }; turn.items.push(item); }
      item.text += params.delta;
    } else if (method === "turn/plan/updated") {
      const item: AiConversationItem = { id: `${turnId}-plan`, kind: "plan", text: params.plan.map((step: any) => `${step.status}: ${step.step}`).join("\n") };
      const index = turn.items.findIndex(value => value.id === item.id); if (index < 0) turn.items.push(item); else turn.items[index] = item;
    } else if (method === "error" && !params.willRetry) { turn.error = params.error.message; turn.status = "failed"; if (conversation.userInput?.turnId === turnId) this.expireQuestion(conversation); }
  }
}
const CONTEXT = "Litzio read-only context (JSON):\n";
function itemFrom(item: any): AiConversationItem | null {
  if (item.type === "userMessage") {
    const references: import("@litzio/plugin-api/ai").AiFileReference[] = [];
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
  if (item.type === "dynamicToolCall") return { id: item.id, kind: "tool", text: [item.namespace, item.tool].filter(Boolean).join(" · "), status: item.success === false ? "failed" : item.status,
    toolResult: { success: item.success ?? null, contentItems: item.contentItems ?? [] } };
  if (item.type === "webSearch") return { id: item.id, kind: "tool", text: item.query };
  if (item.type === "fileChange") return { id: item.id, kind: "tool", text: item.changes.map((change: any) => change.path).join("\n"), status: item.status };
  return null;
}
function turnFrom(turn: any): AiConversationTurn { return { id: turn.id, status: turn.status, items: (turn.items ?? []).map(itemFrom).filter(Boolean), ...(turn.error ? { error: turn.error.message } : {}) }; }

/** Reuse Explorer visibility at each path segment; never include reference content in input. */
function checkedReferences(value: string[], folders: string[], access: FileAccess) {
  if (!Array.isArray(value)) throw new Error("Invalid file references.");
  const scope = folders.length ? new RootAccess(folders) : null;
  const references: import("@litzio/plugin-api/ai").AiFileReference[] = [];
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
