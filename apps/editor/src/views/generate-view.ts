import type { View } from "@litzio/core/views";
import { ASSISTANT, type AssistantConversation, type AssistantConversationInput } from "../../shared/assistant.ts";
import { ViewValidationError } from "./view-api.ts";

export type GenerationRequest = <T>(url: string, body?: unknown) => Promise<T>;

/** Uses the existing conversation adapters for BOTH providers. No alternate model or transport retry. */
export async function generateView(options: {
  request: GenerationRequest;
  input: AssistantConversationInput;
  signal: AbortSignal;
  snapshot(value: AssistantConversation): void;
  status(value: string): void;
  validate(value: unknown): Promise<View>;
  pollMs?: number;
}): Promise<View> {
  const { request, signal } = options;
  let id = options.input.id;
  let message = options.input.message;
  const check = () => { signal.throwIfAborted(); };
  const cancel = () => { if (id) void request(ASSISTANT.conversationsRoute, { action: "interrupt", id }).catch(() => {}); };
  signal.addEventListener("abort", cancel);
  try {
    for (let attempt = 0; attempt <= 2; attempt++) {
      check();
      options.status(attempt ? `Correcting view (${attempt}/2)` : "Proposing view…");
      let conversation = await request<AssistantConversation>(ASSISTANT.conversationsRoute, { action: "send", ...options.input, id, message, viewGeneration: true });
      if (id && conversation.id !== id) throw new Error("View generation changed conversation");
      id = conversation.id;
      if (signal.aborted) cancel();
      const deadline = Date.now() + 180_000;
      while (true) {
        check();
        if (conversation.id !== id || conversation.model !== options.input.model || conversation.reasoningEffort !== options.input.reasoningEffort || (conversation.provider ?? "codex") !== (options.input.provider ?? "codex")) throw new Error("View generation changed conversation, provider, model or reasoning effort");
        options.snapshot(conversation);
        const turn = conversation.turns.at(-1);
        if (!turn) throw new Error("Provider returned no turn");
        if (turn.status !== "inProgress") {
          if (turn.status !== "completed") throw new Error(turn.error ?? `View generation ${turn.status}`);
          const text = turn.items.filter(item => item.kind === "assistant").map(item => item.text).join("\n").trim();
          let proposed: unknown;
          try {
            // Accept a single fenced JSON response, never partial JSON or extracted substrings.
            try { proposed = JSON.parse(text.replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, "$1")); }
            catch { throw new ViewValidationError(`Expected a complete JSON view proposal. Provider said: ${text.slice(0, 400)}`); }
            const view = await options.validate(proposed);
            check(); options.status("View validated"); return view;
          } catch (error) {
            check();
            if (!(error instanceof ViewValidationError)) throw error;
            const reason = String(error);
            options.status(`View validation failed: ${reason}${attempt < 2 ? ` · Correction ${attempt + 1}/2` : " · Correction limit reached"}`);
            if (attempt === 2) throw new Error(`View validation failed after 2 corrections: ${reason}`);
            message = `View validation failed (correction ${attempt + 1}/2): ${reason}\nReturn a corrected complete JSON definition using the SAME catalog and requested view. Do not use tools or change model. If unsupported, explicitly refuse.`;
            break;
          }
        }
        if (Date.now() >= deadline) throw new Error("View generation timed out; stop the response before trying again");
        await new Promise<void>((resolve, reject) => {
          const abort = () => { clearTimeout(timer); reject(signal.reason); };
          const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, options.pollMs ?? 600);
          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) { signal.removeEventListener("abort", abort); abort(); }
        });
        check();
        conversation = await request<AssistantConversation>(`${ASSISTANT.conversationsRoute}?id=${encodeURIComponent(id)}`);
      }
    }
    throw new Error("No view proposal");
  } finally { signal.removeEventListener("abort", cancel); }
}
