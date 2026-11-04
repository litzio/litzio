import { randomUUID } from "node:crypto";
import { DISPLAY_SETTINGS, displayValues, type DisplayChanges, type DisplayReply, type DisplayRequest, type DisplayReceipt, type DisplaySettings } from "../shared/assistant-display.ts";

export const displayTools = [
  { type: "function", name: "read_display_settings", description: "Read the display settings in the Litzio window that sent this turn. Requires that window's visible assistant panel.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { type: "function", name: "change_display_settings", description: "Change only the user's requested Litzio display settings. Propose first and wait for permission unless explicitly requested. Never changes AI permissions, provider/model, plugins or document settings. Requires the sending window's visible assistant panel.", inputSchema: { type: "object", properties: { changes: { type: "object", properties: Object.fromEntries(Object.entries(DISPLAY_SETTINGS).map(([key, values]) => [key, { type: "string", enum: values }])), minProperties: 1, additionalProperties: false } }, required: ["changes"], additionalProperties: false } },
];
type Pending = { conversation: string; client: string; request: Omit<DisplayRequest, "validForMs">; deadline: number; resolve(reply: DisplayReply): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };

/** Provider-neutral, Host-owned validation and volatile request receipts. No browser storage on Host. */
export class AgentDisplayRequests {
  private pending = new Map<string, Pending>();
  private receipts = new Map<string, { conversation: string; client: string; receipt: DisplayReceipt; undone: boolean }>();
  constructor(private timeoutMs = 10_000) {}
  snapshot(conversation: string, client: string) {
    const pending = [...this.pending.values()].find(value => value.conversation === conversation && value.client === client);
    const validForMs = pending ? pending.deadline - performance.now() : 0;
    return pending && validForMs > 0 ? { ...pending.request, validForMs } : undefined;
  }
  async execute(name: string, input: unknown, conversation: string, client?: string) {
    if (!displayTools.some(tool => tool.name === name)) throw new Error("Unknown display tool.");
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => name !== "change_display_settings" || key !== "changes")) throw new Error("Unsupported display tool input.");
    const changes = name === "change_display_settings" ? displayValues((input as { changes?: unknown }).changes) : undefined;
    const { id, reply } = await this.request(conversation, client, changes);
    if (!changes) { if (reply.error) throw new Error(reply.error); return reply.after; }
    const changed = (Object.keys(changes) as (keyof DisplaySettings)[]).filter(key => reply.before[key] !== reply.after[key]);
    const receipt = { ...reply, requestId: id, changed };
    this.receipts.set(id, { conversation, client: client!, receipt, undone: false });
    return receipt;
  }
  private async request(conversation: string, client?: string, changes?: DisplayChanges, expected?: DisplayChanges) {
    if (typeof client !== "string" || !client || client.length > 100) throw new Error("No originating Litzio window for display settings. Send from an open assistant panel.");
    if ([...this.pending.values()].some(value => value.conversation === conversation)) throw new Error("A display request is already pending.");
    const id = randomUUID(), deadline = performance.now() + this.timeoutMs, request = { id, ...(changes ? { changes } : {}), ...(expected ? { expected } : {}) };
    const reply = await new Promise<DisplayReply>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("The originating Litzio window did not confirm display settings. It may be closed, hidden or disconnected; application is unconfirmed. Check the window before retrying.")); }, this.timeoutMs);
      this.pending.set(id, { conversation, client, request, deadline, resolve, reject, timer });
    });
    return { id, reply };
  }
  reply(conversation: string, client: string, id: string, input: DisplayReply) {
    const pending = this.pending.get(id);
    if (!pending || pending.conversation !== conversation || pending.client !== client || performance.now() >= pending.deadline) throw new Error("Display request expired or belongs to another window.");
    const before = displayValues(input?.before, true) as DisplaySettings, after = displayValues(input?.after, true) as DisplaySettings;
    if (input.error !== undefined && typeof input.error !== "string") throw new Error("Invalid display response.");
    if (!input.error && Object.keys(DISPLAY_SETTINGS).some(key => {
      const setting = key as keyof DisplaySettings;
      return after[setting] !== (pending.request.changes?.[setting] ?? before[setting]) ||
        pending.request.expected?.[setting] !== undefined && pending.request.expected[setting] !== before[setting];
    })) throw new Error("Display response does not confirm the requested values.");
    clearTimeout(pending.timer); this.pending.delete(id); pending.resolve({ before, after, ...(input.error ? { error: input.error } : {}) });
  }
  async undo(conversation: string, client: string, id: string) {
    const record = this.receipts.get(id);
    if (!record || record.conversation !== conversation || record.client !== client || record.undone) throw new Error("Display undo is unavailable in this window or Host session.");
    // Consume while pending. A failed comparison can be tried again explicitly.
    record.undone = true;
    try {
      const changes = Object.fromEntries(record.receipt.changed.map(key => [key, record.receipt.before[key]])) as DisplayChanges;
      const expected = Object.fromEntries(record.receipt.changed.map(key => [key, record.receipt.after[key]])) as DisplayChanges;
      if (record.receipt.changed.length) {
        const { reply } = await this.request(conversation, client, changes, expected);
        if (reply.error) throw new Error(reply.error);
      }
      return { undone: true };
    } catch (error) { record.undone = false; throw error; }
  }
  cancel(conversation?: string) {
    for (const [id, value] of this.pending) if (!conversation || value.conversation === conversation) {
      clearTimeout(value.timer); this.pending.delete(id); value.reject(new Error("Display request cancelled; application is unconfirmed."));
    }
  }
}
