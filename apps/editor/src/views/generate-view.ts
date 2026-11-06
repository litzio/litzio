import type { CatalogView as View } from "@litzio/core/views-v2";
import { ASSISTANT, type AssistantConversation, type AssistantConversationInput } from "../../shared/assistant.ts";
import { VIEW_GENERATION_TIMEOUT_MS, VIEW_GENERATION_OUTPUT_BYTES } from "../../shared/view-generation.ts";
import { i18n } from "../i18n.ts";
import { ViewValidationError } from "./view-api.ts";

export type GenerationValidationContext = { id: string; turnId: string; requestId: string };
export type GenerationRequest = <T>(url: string, body?: unknown, signal?: AbortSignal) => Promise<T>;
/** Protect against a transport that completes after cancellation as well as native fetch. */
function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    work.then(value => { signal.removeEventListener("abort", abort); signal.aborted ? reject(signal.reason) : resolve(value); }, error => { signal.removeEventListener("abort", abort); reject(error); });
    if (signal.aborted) abort();
  });
}

export async function generateView(options: {
  request: GenerationRequest; input: AssistantConversationInput; signal: AbortSignal;
  snapshot(value: AssistantConversation): void; status(value: string): void;
  cancelled?(): void;
  validate(value: unknown, signal: AbortSignal, context: GenerationValidationContext): Promise<View>;
  pollMs?: number; timeoutMs?: number;
}): Promise<View> {
  const { request } = options;
  let id = options.input.id, message = options.input.message;
  for (let attempt = 0; attempt <= 2; attempt++) {
    options.signal.throwIfAborted();
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(new Error(i18n.t("View generation timed out."))), options.timeoutMs ?? VIEW_GENERATION_TIMEOUT_MS);
    const signal = AbortSignal.any([options.signal, deadline.signal]);
    let requestId: string | undefined;
    const cancel = () => {
      options.cancelled?.();
      if (requestId) void request(ASSISTANT.conversationsRoute, { action: "cancel-view-generation", requestId }).catch(() => {});
    };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      options.status(attempt ? i18n.t("Correcting view ({{attempt}}/2)", { attempt }) : i18n.t("Proposing view…"));
      const prepared = await abortable(request<{ requestId: string }>(ASSISTANT.conversationsRoute, { action: "prepare-view-generation", ...(options.input.viewGenerationTarget ? { target: options.input.viewGenerationTarget } : {}) }, signal), signal);
      requestId = prepared.requestId;
      signal.throwIfAborted();
      let conversation = await abortable(request<AssistantConversation>(ASSISTANT.conversationsRoute, { action: "send", ...options.input, id, message, viewGeneration: true, viewGenerationCorrection: attempt, viewGenerationRequest: requestId }, signal), signal);
      if (id && conversation.id !== id) throw new Error(i18n.t("View generation changed conversation."));
      id = conversation.id;
      while (true) {
        signal.throwIfAborted();
        if (conversation.id !== id || conversation.model !== options.input.model || conversation.reasoningEffort !== options.input.reasoningEffort || (conversation.provider ?? "codex") !== (options.input.provider ?? "codex")) throw new Error(i18n.t("View generation changed conversation, provider, model or reasoning effort."));
        options.snapshot(conversation);
        const turn = conversation.turns.at(-1);
        if (!turn) throw new Error(i18n.t("Provider returned no turn."));
        if (turn.status !== "inProgress") {
          if (turn.status !== "completed") throw new Error(turn.error ?? i18n.t("View generation did not complete."));
          const text = turn.items.filter(item => item.kind === "assistant").map(item => item.text).join("\n").trim();
          if (new TextEncoder().encode(text).byteLength > VIEW_GENERATION_OUTPUT_BYTES) throw new Error("View generation output exceeds byte limit.");
          try {
            let proposed: unknown;
            try { proposed = JSON.parse(text.replace(/^\x60\x60\x60(?:json)?\s*\n([\s\S]*?)\n\x60\x60\x60$/i, "$1")); }
            catch { throw new ViewValidationError(i18n.t("Expected a complete JSON view proposal. Provider said: {{text}}", { text: text.slice(0, 400) })); }
            const view = await abortable(options.validate(proposed, signal, { id, turnId: turn.id, requestId: requestId! }), signal);
            signal.throwIfAborted(); options.status(attempt ? i18n.t("View validated · Corrections: {{count}}/2", { count: attempt }) : i18n.t("View validated")); return view;
          } catch (error) {
            signal.throwIfAborted();
            if (!(error instanceof ViewValidationError)) throw error;
            const reason = String(error);
            if (attempt === 2) throw new Error(i18n.t("View validation failed. Revise the request and try again."));
            message = i18n.t("View validation failed (correction {{attempt}}/2): {{reason}}", { attempt: attempt + 1, reason }) + "\n" + i18n.t("Return a corrected complete JSON definition using the same catalog and requested view. Do not use tools or change model. Explicitly refuse unsupported requests.");
            break;
          }
        }
        await abortable(new Promise<void>(resolve => setTimeout(resolve, options.pollMs ?? 600)), signal);
        conversation = await abortable(request<AssistantConversation>(`${ASSISTANT.conversationsRoute}?id=${encodeURIComponent(id)}`, undefined, signal), signal);
      }
    } finally { clearTimeout(timer); signal.removeEventListener("abort", cancel); }
  }
  throw new Error(i18n.t("No view proposal."));
}
