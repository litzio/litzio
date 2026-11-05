import assert from "node:assert/strict";
import test from "node:test";
import { generateView } from "../src/views/generate-view.ts";
import { statisticsView, ViewValidationError } from "../src/views/view-api.ts";
import { validateView } from "@litzio/core/views";
import type { AssistantConversation } from "../shared/assistant.ts";

test("both providers validate only final responses, correct in the same conversation/model at most twice", async () => {
  for (const provider of ["codex", "copilot"] as const) {
    const calls: any[] = [], statuses: string[] = [];
    let attempt = 0, polls = 0;
    const snapshot = (): AssistantConversation => ({ id: "same-thread", provider, model: "selected-model", reasoningEffort: "low", title: "View", folders: [], createdAt: 0, updatedAt: 0,
      turns: [{ id: `turn-${attempt}`, status: polls ? "completed" : "inProgress", items: [{ id: "answer", kind: "assistant", text: polls ? JSON.stringify(attempt < 3 ? { invalid: true } : statisticsView) : '{"partial":' }] }] });
    const result = await generateView({ input: { provider, model: "selected-model", reasoningEffort: "low", folders: [], message: "Documents" }, signal: new AbortController().signal, pollMs: 0,
      request: async <T>(_url: string, body?: any): Promise<T> => { calls.push(body); if (body) { attempt++; polls = 0; } else polls++; return snapshot() as T; },
      snapshot: () => {}, status: message => statuses.push(message), validate: async value => { try { return validateView(value); } catch (error) { throw new ViewValidationError(String(error)); } },
    });
    assert.equal(result.schemaVersion, 1); assert.equal(attempt, 3);
    const sends = calls.filter(Boolean);
    assert.ok(sends.every(call => call.model === "selected-model" && call.provider === provider && call.viewGeneration));
    assert.equal(sends[1].id, "same-thread"); assert.equal(sends[2].id, "same-thread");
    assert.match(sends[1].message, /correction 1\/2/); assert.match(sends[2].message, /correction 2\/2/);
    assert.equal(statuses.filter(s => s.includes("validation failed")).length, 2);
  }
});

test("exhausted validation, transport errors, model changes and cancellation do not fall back or retry invisibly", async () => {
  for (const mode of ["invalid", "transport", "validation-transport", "model", "thread", "cancel"] as const) {
    let sends = 0;
    const controller = new AbortController();
    await assert.rejects(generateView({ input: { id: mode === "thread" ? "original" : undefined, provider: "codex", model: "chosen", reasoningEffort: "low", folders: [], message: "View" }, signal: controller.signal, pollMs: 0,
      request: async <T>(_url: string, body?: any): Promise<T> => {
        if (body?.action === "interrupt") return {} as T;
        sends++;
        if (mode === "transport") throw new Error("disconnected");
        if (mode === "cancel") controller.abort(new Error("stopped"));
        return { id: "thread", model: mode === "model" ? "other" : "chosen", reasoningEffort: "low", turns: [{ status: "completed", items: [{ kind: "assistant", text: '{}' }] }] } as T;
      }, snapshot: () => {}, status: () => {}, validate: async () => { if (mode === "validation-transport") throw new Error("Host disconnected"); throw new ViewValidationError("invalid binding"); },
    }));
    assert.equal(sends, mode === "invalid" ? 3 : 1);
  }
});
