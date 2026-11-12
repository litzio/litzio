import { randomUUID } from "node:crypto";
import { screenAction, type ScreenActionRequest, type ScreenActionResult } from "../shared/assistant-screen.ts";
const targets = { anyOf: [{ type: "string", enum: ["all"] }, { type: "array", minItems: 1, items: { type: "string" } }] };
export const screenActionTools = [
  { type: "function", name: "close_tabs", description: "Close one, several or all tabs in the sending window. Use tabIds from read_screen_context or all. Existing unsaved-edit confirmation is preserved; report remaining tabs and never claim pending confirmation completed.", inputSchema: { type: "object", properties: { tabIds: targets }, required: ["tabIds"], additionalProperties: false } },
  { type: "function", name: "open_folder", description: "Open a folder path on a connected Host in the sending window, using existing folder access. Reversible; no extra approval needed.", inputSchema: { type: "object", properties: { hostId: { type: "string" }, path: { type: "string" } }, required: ["hostId", "path"], additionalProperties: false } },
  { type: "function", name: "close_folders", description: "Close specified folders or all opened folders in the sending window. Does not close document tabs or delete files.", inputSchema: { type: "object", properties: { folders: { anyOf: [{ type: "string", enum: ["all"] }, { type: "array", minItems: 1, items: { type: "object", properties: { hostId: { type: "string" }, path: { type: "string" } }, required: ["hostId", "path"], additionalProperties: false } }] } }, required: ["folders"], additionalProperties: false } },
];
type Pending = { conversation: string; client: string; request: ScreenActionRequest; deadline: number; resolve(value: ScreenActionResult): void; timer: ReturnType<typeof setTimeout> };
const failure = (outcome: ScreenActionResult["outcome"], reason: string): ScreenActionResult => ({ outcome, completed: [], remaining: [{ target: "request", reason }] });
/** Window-scoped in-flight actions. A lost reply is uncertain, never an invitation to retry. */
export class AgentScreenActionRequests {
  private pending = new Map<string, Pending>();
  constructor(private timeoutMs = 10_000) {}
  snapshot(conversation: string, client: string) {
    const value = [...this.pending.values()].find(item => item.conversation === conversation && item.client === client);
    const validForMs = value ? (value.deadline === Infinity ? this.timeoutMs : value.deadline - performance.now()) : 0;
    return value && validForMs > 0 ? { ...value.request, validForMs } : undefined;
  }
  execute(name: string, input: unknown, conversation: string, client?: string): Promise<ScreenActionResult> {
    let action;
    try { action = screenAction(name, input); } catch { return Promise.resolve(failure("invalid_input", "Invalid screen action input.")); }
    if (!client || client.length > 100) return Promise.resolve(failure("unavailable", "No originating window."));
    if ([...this.pending.values()].some(item => item.conversation === conversation)) return Promise.resolve(failure("conflict", "Another screen action is pending."));
    const id = randomUUID();
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.pending.delete(id); resolve(failure("uncertain", "Window did not confirm the action. Query screen state before deciding next steps; do not blindly retry.")); }, this.timeoutMs);
      this.pending.set(id, { conversation, client, request: { id, action, validForMs: this.timeoutMs }, deadline: performance.now() + this.timeoutMs, resolve, timer });
    });
  }
  acknowledge(conversation: string, client: string, id: string) {
    const pending = this.pending.get(id);
    if (!pending || pending.conversation !== conversation || pending.client !== client || performance.now() >= pending.deadline) throw new Error("Request expired or belongs to another window.");
    clearTimeout(pending.timer);
    pending.deadline = Infinity;
  }
  reply(conversation: string, client: string, id: string, input: ScreenActionResult) {
    const value = this.pending.get(id);
    if (!value || value.conversation !== conversation || value.client !== client || performance.now() >= value.deadline) throw new Error("Screen action expired or belongs to another window.");
    if (!input || !["success", "conflict", "invalid_input", "unavailable", "forbidden", "uncertain"].includes(input.outcome) || !Array.isArray(input.completed) || !input.completed.every(item => typeof item === "string") || !Array.isArray(input.remaining) || !input.remaining.every(item => item && typeof item.target === "string" && typeof item.reason === "string")) throw new Error("Invalid screen action response.");
    clearTimeout(value.timer); this.pending.delete(id);
    value.resolve({ outcome: input.outcome, completed: [...input.completed], remaining: input.remaining.map(({target, reason}) => ({target, reason})) });
  }
  cancel(conversation?: string) {
    for (const [id, value] of this.pending) if (!conversation || value.conversation === conversation) {
      clearTimeout(value.timer); this.pending.delete(id); value.resolve(failure("uncertain", "Action cancelled; query screen state before retrying."));
    }
  }
}
