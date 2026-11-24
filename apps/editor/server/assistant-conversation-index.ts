import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { AssistantConversationInfo, AssistantConversation, AssistantQuestionRecord } from "../shared/assistant.ts";
import type { AssistantAttachments } from "./assistant-attachments.ts";
import type { ProviderConnections } from "./provider-connections.ts";
import { conversationProvider, providerEngine } from "./provider-engine.ts";

export type ConversationIndexEntry = AssistantConversationInfo & { attachments?: import("./assistant-attachments.ts").AttachmentRecord[]; copilotCliReasoningEffort?: string; questions?: { itemId: string; text: string; question: AssistantQuestionRecord }[] };

/** Owns metadata file I/O; live conversations and attachment lifetimes stay with their existing owners. */
export class AssistantConversationIndex {
  constructor(private connection: Pick<ProviderConnections, "cwd" | "environment">, private attachments: Pick<AssistantAttachments, "owned">) {}
  private get file() { return path.join(this.connection.cwd, "conversations.json"); }
  list(): ConversationIndexEntry[] {
    this.connection.environment();
    return existsSync(this.file) ? JSON.parse(readFileSync(this.file, "utf8")) : [];
  }
  save(conversation: AssistantConversation) {
    const { id, folders, createdAt, updatedAt, provider, permissionMode, permissionFallback, archivedAt } = conversation;
    const questions = conversation.turns.flatMap(turn => turn.items.filter(item => item.question).map(item => ({ itemId: item.id, text: item.text, question: item.question! })));
    const previous = this.list();
    // A title is set at creation and changed only by rename; a stale conversation object never restores an old one.
    const title = previous.find(entry => entry.id === id)?.title ?? conversation.title;
    const attachments = this.attachments.owned(id);
    const entries = previous.filter(entry => entry.id !== id);
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify([{ id, title, folders, createdAt, updatedAt, ...(provider ? { provider } : {}), ...(permissionMode ? { permissionMode } : {}), ...(permissionFallback ? { permissionFallback } : {}), ...(archivedAt ? { archivedAt } : {}),
        ...(attachments?.length ? { attachments } : {}),
        ...(questions.length ? { questions } : {}),
        ...(providerEngine(conversationProvider(conversation)) === "acp" && conversation.copilot?.reasoningEffortSource === "cli" ? { copilotCliReasoningEffort: conversation.reasoningEffort } : {}) }, ...entries]) + "\n", { flag: "wx" });
      renameSync(temporary, this.file);
    } finally { if (existsSync(temporary)) unlinkSync(temporary); }
  }
  /** Changes one entry in place; history order and updatedAt stay unchanged. */
  update(id: string, change: (entry: ConversationIndexEntry) => void) {
    const entries = this.list(), entry = entries.find(entry => entry.id === id);
    if (!entry) throw new Error("Conversation was not found.");
    change(entry);
    this.write(entries);
    return entry;
  }
  remove(id: string) { this.write(this.list().filter(entry => entry.id !== id)); }
  private write(entries: ConversationIndexEntry[]) {
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try { writeFileSync(temporary, JSON.stringify(entries), { flag: "wx" }); renameSync(temporary, this.file); }
    finally { if (existsSync(temporary)) unlinkSync(temporary); }
  }
}
