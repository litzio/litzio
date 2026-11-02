import { readFileSync, writeFileSync, renameSync, existsSync, statSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { AiAgentSettings, AiConversation, AiConversationInfo, AiConversationInput, AiConversationItem, AiConversationTurn } from "@litzio/plugin-api/ai";
import type { AiAgentConnection } from "./ai-agent-connection.ts";
import { accessPath, type FileAccess } from "./file-access.ts";

/** Litzio persists only its history index. Codex owns all conversation content. */
export class AiAgentConversations {
  private conversations = new Map<string, AiConversation>();
  private pending = new Set<string>();
  private loaded = new Set<string>();
  constructor(private connection: AiAgentConnection, private access: FileAccess) {
    connection.client.on("notification", (method, params) => this.notification(method, params));
    connection.client.on("disconnected", (message: string) => {
      this.loaded.clear();
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
  async resume(id: string, settings: AiAgentSettings, language: AiConversation["responseLanguage"]) {
    if (typeof id !== "string" || !languages.includes(language)) throw new Error("Invalid conversation selection.");
    if (this.conversations.get(id)?.turns.some(turn => turn.status === "inProgress")) return this.current(id);
    const info = this.list().find(entry => entry.id === id);
    if (!info) throw new Error("Conversation was not found.");
    const conversation: AiConversation = { ...info, turns: [], model: settings.model, reasoningEffort: settings.reasoningEffort,
      responseLanguage: language, tokenUsage: this.conversations.get(id)?.tokenUsage };
    // Install before the RPC so token-usage notifications during resume are retained.
    this.conversations.set(id, conversation);
    const result = await this.connection.client.request("thread/resume", { threadId: id, cwd: this.connection.cwd,
      approvalPolicy: "never", sandbox: "read-only", excludeTurns: true });
    // Codex 0.166.0 uses paginated histories; hydrate full turns rather than only the latest page.
    const turns: any[] = []; let cursor: string | null = null;
    do {
      const page: { data: any[]; nextCursor: string | null } = await this.connection.client.request("thread/turns/list", { threadId: id, cursor, sortDirection: "asc", itemsView: "full" });
      turns.push(...page.data); cursor = page.nextCursor;
    } while (cursor);
    conversation.turns = turns.map(turnFrom); conversation.model = result.model ?? settings.model;
    conversation.reasoningEffort = result.reasoningEffort ?? settings.reasoningEffort;
    // The language selection is carried in Codex's user input, not a second transcript store.
    for (const turn of turns) for (const item of turn.items) if (item.type === "userMessage") {
      const context = item.content?.find((part: any) => part.type === "text" && part.text.startsWith(CONTEXT));
      if (context) { try { const value = JSON.parse(context.text.slice(CONTEXT.length)); if (languages.includes(value.responseLanguage)) conversation.responseLanguage = value.responseLanguage; } catch { /* Ordinary CLI input has no Litzio context. */ } }
    }
    this.conversations.set(id, conversation);
    this.loaded.add(id);
    return conversation;
  }
  async send(input: AiConversationInput, settings: AiAgentSettings) {
    if (!input || typeof input.message !== "string" || !input.message.trim() || !languages.includes(input.responseLanguage) ||
      typeof input.model !== "string" || typeof input.reasoningEffort !== "string" || !Array.isArray(input.folders)) throw new Error("Invalid conversation input.");
    const folders = [...new Set(input.folders.map(folder => {
      if (typeof folder !== "string" || !path.isAbsolute(folder)) throw new Error("Invalid opened folder.");
      const resolved = accessPath(folder, this.access);
      if (!statSync(resolved).isDirectory()) throw new Error("Opened folder is unavailable.");
      return resolved;
    }))];
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
      if (conversation && !this.loaded.has(conversation.id)) conversation = await this.resume(conversation.id, settings, input.responseLanguage);
      const active = conversation?.turns.find(turn => turn.status === "inProgress");
      if (active && (input.model !== conversation!.model || input.reasoningEffort !== conversation!.reasoningEffort)) throw new Error("Model and reasoning effort are locked while running.");
      if (!active) {
        const models = await this.connection.models();
        if (!models.models.some(model => model.model === input.model && model.supportedReasoningEfforts.some(effort => effort.reasoningEffort === input.reasoningEffort))) throw new Error("Invalid AI model or reasoning effort.");
      }
      if (!conversation) {
        const result = await this.connection.client.request("thread/start", { model: input.model, cwd: this.connection.cwd,
          approvalPolicy: "never", sandbox: "read-only", ephemeral: false });
        conversation = { id: result.thread.id, title: input.message.trim().slice(0, 80), folders, createdAt: Date.now(), updatedAt: Date.now(),
          turns: [], model: input.model, reasoningEffort: input.reasoningEffort, responseLanguage: input.responseLanguage };
        this.conversations.set(conversation.id, conversation);
        this.loaded.add(conversation.id);
        this.save(conversation);
      }
      const context = { responseLanguage: input.responseLanguage, folders, document: input.document ?? null };
      const messages = [{ type: "text", text: input.message, text_elements: [] }, { type: "text", text: CONTEXT + JSON.stringify(context), text_elements: [] }];
      if (active) {
        await this.connection.client.request("turn/steer", { threadId: conversation.id, expectedTurnId: active.id, input: messages });
      } else {
        conversation.model = input.model; conversation.reasoningEffort = input.reasoningEffort;
        const result = await this.connection.client.request("turn/start", { threadId: conversation.id, input: messages,
          cwd: this.connection.cwd, model: input.model, effort: input.reasoningEffort, summary: "auto", approvalPolicy: "never",
          sandboxPolicy: settings.writeAccess === "opened-folders" ? { type: "workspaceWrite", writableRoots: folders,
            networkAccess: false, excludeTmpdirEnvVar: true, excludeSlashTmp: true } : { type: "readOnly", networkAccess: false } });
        if (!conversation.turns.some(turn => turn.id === result.turn.id)) conversation.turns.push(turnFrom(result.turn));
      }
      conversation.responseLanguage = input.responseLanguage; conversation.folders = folders; conversation.updatedAt = Date.now();
      this.save(conversation);
      return conversation;
    } finally { this.pending.delete(key); }
  }
  async interrupt(id: string) {
    const conversation = this.current(id), turn = conversation.turns.find(turn => turn.status === "inProgress");
    if (turn) await this.connection.client.request("turn/interrupt", { threadId: id, turnId: turn.id });
    return conversation;
  }
  private notification(method: string, params: any) {
    const conversation = this.conversations.get(params.threadId);
    if (!conversation) return;
    if (method === "thread/tokenUsage/updated") {
      conversation.tokenUsage = { used: params.tokenUsage.last.totalTokens, limit: params.tokenUsage.modelContextWindow }; return;
    }
    const turnId = params.turnId ?? params.turn?.id;
    if (!turnId) return;
    let turn = conversation.turns.find(turn => turn.id === turnId);
    if (!turn) { turn = { id: turnId, status: "inProgress", items: [] }; conversation.turns.push(turn); }
    if (method === "turn/started" || method === "turn/completed") {
      turn.status = params.turn.status;
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
    } else if (method === "error" && !params.willRetry) { turn.error = params.error.message; turn.status = "failed"; }
  }
}
const languages = ["ko", "en", "ja", "document"];
const CONTEXT = "Litzio read-only context (JSON):\n";
function itemFrom(item: any): AiConversationItem | null {
  if (item.type === "userMessage") return { id: item.id, kind: "user", text: item.content.filter((part: any) => part.type === "text" && !part.text.startsWith(CONTEXT)).map((part: any) => part.text).join("\n") };
  if (item.type === "agentMessage") return { id: item.id, kind: "assistant", text: item.text };
  if (item.type === "reasoning") return { id: item.id, kind: "reasoning", text: item.summary.join("\n") };
  if (item.type === "plan") return { id: item.id, kind: "plan", text: item.text };
  if (item.type === "commandExecution") return { id: item.id, kind: "tool", text: item.command, status: item.status };
  if (item.type === "mcpToolCall") return { id: item.id, kind: "tool", text: `${item.server} · ${item.tool}`, status: item.status };
  if (item.type === "dynamicToolCall") return { id: item.id, kind: "tool", text: [item.namespace, item.tool].filter(Boolean).join(" · "), status: item.status };
  if (item.type === "webSearch") return { id: item.id, kind: "tool", text: item.query };
  if (item.type === "fileChange") return { id: item.id, kind: "tool", text: item.changes.map((change: any) => change.path).join("\n"), status: item.status };
  return null;
}
function turnFrom(turn: any): AiConversationTurn { return { id: turn.id, status: turn.status, items: (turn.items ?? []).map(itemFrom).filter(Boolean), ...(turn.error ? { error: turn.error.message } : {}) }; }
