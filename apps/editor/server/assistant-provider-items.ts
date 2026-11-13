import type { AssistantQuestionRecord, AssistantConversationItem, AssistantConversationTurn } from "../shared/assistant.ts";
import { displayToolResult } from "./assistant-conversation-display.ts";

export const CONTEXT = "Litzio read-only context (JSON):\n";
export const QUESTION_ANSWER_CONTEXT = "Litzio question answers (JSON):\n";

// Bounded display payload per step.
export function boundedWork(text: string) {
  return { detail: text.slice(0, 16_000), truncated: text.length > 16_000 };
}
export function itemFrom(item: any, userMessageSource: AssistantConversationItem["userMessageSource"] = "provider-live", turnId = ""): AssistantConversationItem | null {
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
export function pluginOperationItem(id: string, success: boolean | null, entry: any): AssistantConversationItem {
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
export function turnFrom(turn: any, userMessageSource: AssistantConversationItem["userMessageSource"] = "provider-live"): AssistantConversationTurn { return { id: turn.id, status: turn.status, items: (turn.items ?? []).map((item: any) => itemFrom(item, userMessageSource, turn.id)).filter(Boolean), ...(turn.error ? { error: turn.error.message } : {}) }; }
