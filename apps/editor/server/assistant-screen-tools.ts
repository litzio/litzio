import { randomUUID } from "node:crypto";
import { screenInfo, type ScreenInfo, type ScreenRequest } from "../shared/assistant-screen.ts";

export const screenTool = { type: "function", name: "read_screen_context", description: "Read current active tab, open tabs (kind, Host, target, unsaved flag) and opened folders in the Litzio window that sent this turn. No unsaved text, selection or plugin result data. Requires that window's visible assistant panel; fails if unavailable.", inputSchema: { type: "object", properties: {}, additionalProperties: false } };
type Pending = { conversation: string; client: string; request: ScreenRequest; deadline: number; resolve(value: ScreenInfo): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };
/** Only in-flight requests live on Host; screen state stays in its originating window. */
export class AgentScreenRequests {
  private pending = new Map<string, Pending>();
  constructor(private timeoutMs = 10_000) {}
  snapshot(conversation: string, client: string) {
    const pending = [...this.pending.values()].find(item => item.conversation === conversation && item.client === client);
    const validForMs = pending ? pending.deadline - performance.now() : 0;
    return pending && validForMs > 0 ? { id: pending.request.id, validForMs } : undefined;
  }
  execute(input: unknown, conversation: string, client?: string): Promise<ScreenInfo> {
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length) throw new Error("Screen query takes no arguments.");
    if (typeof client !== "string" || !client || client.length > 100) throw new Error("No originating Litzio window. Send from an open assistant panel.");
    if ([...this.pending.values()].some(item => item.conversation === conversation)) throw new Error("A screen query is already pending.");
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("The originating Litzio window did not respond to the screen query. It may be closed, hidden or disconnected. Screen state is unavailable.")); }, this.timeoutMs);
      this.pending.set(id, { conversation, client, request: { id, validForMs: this.timeoutMs }, deadline: performance.now() + this.timeoutMs, resolve, reject, timer });
    });
  }
  reply(conversation: string, client: string, id: string, input: ScreenInfo) {
    const pending = this.pending.get(id);
    if (!pending || pending.conversation !== conversation || pending.client !== client || performance.now() >= pending.deadline) throw new Error("Screen query expired or belongs to another window.");
    const result = screenInfo(input);
    clearTimeout(pending.timer); this.pending.delete(id); pending.resolve(result);
  }
  cancel(conversation?: string) {
    for (const [id, pending] of this.pending) if (!conversation || pending.conversation === conversation) {
      clearTimeout(pending.timer); this.pending.delete(id); pending.reject(new Error("Screen query cancelled; screen state is unavailable."));
    }
  }
}
