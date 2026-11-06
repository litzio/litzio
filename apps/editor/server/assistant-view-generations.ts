import { randomUUID } from "node:crypto";
import { VIEW_GENERATION_TIMEOUT_MS } from "../shared/view-generation.ts";
type Pending = { owner: string; deadline: number; cancelled: boolean; started: boolean; conversation?: string; turn?: string; timer: ReturnType<typeof setTimeout> };

/** Short-lived cancellation handles, prepared before any provider work can start. */
export class AssistantViewGenerations {
  private requests = new Map<string, Pending>();
  constructor(private interrupt: (id: string, turn?: string) => Promise<unknown>, private timeoutMs = VIEW_GENERATION_TIMEOUT_MS) {}
  prepare(owner = "litzio.assistant") {
    for (const [id, entry] of this.requests) if (entry.deadline <= Date.now()) { void this.cancel(id).catch(() => {}); clearTimeout(entry.timer); this.requests.delete(id); }
    if (this.requests.size >= 128) throw new Error("Too many pending view generation requests");
    const requestId = randomUUID();
    const entry: Pending = { owner, deadline: Date.now() + this.timeoutMs, cancelled: false, started: false, timer: setTimeout(() => { void this.cancel(requestId).catch(() => {}); }, this.timeoutMs) };
    entry.timer.unref(); this.requests.set(requestId, entry);
    return { requestId };
  }
  async run<T extends { id: string; turns: { id: string }[] }>(requestId: unknown, start: (owner: string) => Promise<T>): Promise<T> {
    const entry = typeof requestId === "string" ? this.requests.get(requestId) : undefined;
    if (!entry || entry.started || entry.cancelled || entry.deadline <= Date.now()) throw new Error("View generation request expired or cancelled");
    entry.started = true;
    const result = await start(entry.owner);
    entry.conversation = result.id;
    entry.turn = result.turns.at(-1)?.id;
    if (entry.cancelled || entry.deadline <= Date.now()) {
      await this.interrupt(result.id, entry.turn);
      throw new Error("View generation request cancelled");
    }
    return result;
  }
  assertResult(requestId: unknown, id: unknown, turn: unknown) {
    const entry = typeof requestId === "string" ? this.requests.get(requestId) : undefined;
    if (!entry || !entry.started || entry.cancelled || entry.deadline <= Date.now() || entry.conversation !== id || entry.turn !== turn) throw new Error("View generation request expired or mismatched.");
  }
  async cancel(requestId: unknown) {
    const entry = typeof requestId === "string" ? this.requests.get(requestId) : undefined;
    if (entry) { entry.cancelled = true; if (entry.conversation) await this.interrupt(entry.conversation, entry.turn); }
    return { acknowledged: true };
  }
  close() { for (const entry of this.requests.values()) { entry.cancelled = true; clearTimeout(entry.timer); } this.requests.clear(); }
}
