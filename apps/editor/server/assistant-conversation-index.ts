import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { AssistantConversationInfo, AssistantConversation, AssistantQuestionRecord } from "../shared/assistant.ts";
import type { AssistantAttachments } from "./assistant-attachments.ts";
import type { ProviderConnections } from "./provider-connections.ts";

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
    const entries = this.list().filter(entry => entry.id !== id);
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try { writeFileSync(temporary, JSON.stringify(entries), { flag: "wx" }); renameSync(temporary, this.file); }
    finally { if (existsSync(temporary)) unlinkSync(temporary); }
  }
}
