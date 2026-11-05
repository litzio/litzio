import assert from "node:assert/strict";
import test from "node:test";
import { generateView } from "../src/views/generate-view.ts";
import { statisticsView, ViewValidationError } from "../src/views/view-api.ts";
import { validateView } from "@litzio/core/views";
import type { AssistantConversation } from "../shared/assistant.ts";
import { AssistantViewGenerations } from "../server/assistant-view-generations.ts";
import { createAssistantRequest } from "../src/assistant-api.ts";
import { createHostClient } from "../src/host-client.ts";
import { viewRequest } from "../src/views/view-api.ts";
import { i18n } from "../src/i18n.ts";

test("send, poll and validation cancellation settle before delayed transports and discard their late results", async () => {
  for (const phase of ["send", "poll", "validate"] as const) {
    let release!: (value: any) => void, entered!: () => void, signal: AbortSignal | undefined, published = 0;
    const gate = new Promise<any>(resolve => { release = resolve; });
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    const controller = new AbortController(), cancellations: unknown[] = [];
    const complete = { id: "thread", provider: "codex", model: "selected", reasoningEffort: "low", turns: [{ id: "turn", status: "completed", items: [{ kind: "assistant", text: JSON.stringify(statisticsView) }] }] };
    const running = generateView({ signal: controller.signal, input: { provider: "codex", model: "selected", reasoningEffort: "low", folders: [], message: "View" }, pollMs: 0,
      request: async <T>(_url: string, body?: any, requestSignal?: AbortSignal): Promise<T> => {
        if (body?.action === "prepare-view-generation") return { requestId: "prepared" } as T;
        if (body?.action === "cancel-view-generation") { cancellations.push(body.requestId); return {} as T; }
        if (phase === "send" || phase === "poll" && !body) { signal = requestSignal; entered(); return await gate as T; }
        return (phase === "poll" ? { ...complete, turns: [{ id: "turn", status: "inProgress", items: [] }] } : complete) as T;
      }, snapshot: () => {}, status: () => {}, validate: async (_value, requestSignal) => {
        if (phase === "validate") { signal = requestSignal; entered(); return gate; }
        return validateView(statisticsView);
      },
    }).then(() => { published++; });
    await waiting;
    controller.abort(new Error("cancelled"));
    await assert.rejects(running, /cancelled/);
    assert.equal(signal?.aborted, true); assert.deepEqual(cancellations, ["prepared"]);
    release(phase === "validate" ? validateView(statisticsView) : complete);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(published, 0);
  }
});

test("the generation deadline aborts a send that never settles", async () => {
  let received: AbortSignal | undefined;
  const cancellations: string[] = [];
  await assert.rejects(generateView({ signal: new AbortController().signal, timeoutMs: 5,
    input: { provider: "codex", model: "selected", reasoningEffort: "low", folders: [], message: "View" },
    request: async <T>(_url: string, body?: any, signal?: AbortSignal): Promise<T> => {
      if (body.action === "prepare-view-generation") return { requestId: "deadline" } as T;
      if (body.action === "cancel-view-generation") { cancellations.push(body.requestId); return {} as T; }
      received = signal; return new Promise<T>(() => {});
    }, snapshot: () => assert.fail("late result"), status: () => {}, validate: async value => validateView(value),
  }), /timed out/);
  assert.equal(received?.aborted, true); assert.deepEqual(cancellations, ["deadline"]);
});

test("Host cancellation survives a late conversation identity and expires unused handles", async () => {
  const stopped: unknown[] = [], requests = new AssistantViewGenerations(async (id, turn) => { stopped.push([id, turn]); });
  const first = requests.prepare(); await requests.cancel(first.requestId);
  await assert.rejects(requests.run(first.requestId, async () => { throw new Error("must not start"); }), /cancelled/);
  const second = requests.prepare(); let release!: (value: any) => void;
  const starting = requests.run(second.requestId, () => new Promise<{ id: string; turns: { id: string }[] }>(resolve => { release = resolve; }));
  await requests.cancel(second.requestId);
  release({ id: "late-thread", turns: [{ id: "only-this-turn" }] });
  await assert.rejects(starting, /cancelled/);
  assert.deepEqual(stopped, [["late-thread", "only-this-turn"]]); requests.close();
  const expiry = new AssistantViewGenerations(async () => {}, 1), unused = expiry.prepare();
  await new Promise(resolve => setTimeout(resolve, 5));
  await assert.rejects(expiry.run(unused.requestId, async () => ({ id: "no", turns: [] })), /expired|cancelled/); expiry.close();
});

test("assistant and view transports pass AbortSignal to fetch", async context => {
  const client = createHostClient("http://fixture.invalid");
  for (const surface of ["assistant", "view"]) {
    let received: AbortSignal | undefined;
    context.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => new Promise((_resolve, reject) => {
      received = init.signal!; received.addEventListener("abort", () => reject(received!.reason), { once: true });
    }));
    const controller = new AbortController();
    const run = surface === "assistant" ? createAssistantRequest(client)("/api/assistant/conversations", { action: "send" }, controller.signal) : viewRequest(client, { action: "validate", view: statisticsView }, controller.signal);
    await Promise.resolve(); controller.abort(new Error("transport aborted"));
    await assert.rejects(run, /transport aborted/); assert.equal(received, controller.signal);
    context.mock.restoreAll();
  }
});

test("Korean generation progress and correction errors use bundled translations", async () => {
  await i18n.changeLanguage("ko");
  let sends = 0; const statuses: string[] = [], messages: string[] = [];
  try {
    await generateView({ signal: new AbortController().signal, input: { provider: "codex", model: "selected", reasoningEffort: "low", folders: [], message: "문서 통계" },
      request: async <T>(_url: string, body?: any): Promise<T> => {
        if (body?.action === "prepare-view-generation") return { requestId: "prepared" } as T;
        sends++; messages.push(body.message);
        return { id: "thread", model: "selected", reasoningEffort: "low", turns: [{ status: "completed", items: [{ kind: "assistant", text: JSON.stringify(statisticsView) }] }] } as T;
      }, snapshot: () => {}, status: value => statuses.push(value), validate: async value => { if (sends === 1) throw new ViewValidationError("field"); return validateView(value); },
    });
    assert.ok(statuses.some(value => value.includes("검증 실패"))); assert.ok(statuses.includes("뷰 명세 검증 완료")); assert.match(messages[1], /수정 1\/2/);
  } finally { await i18n.changeLanguage("en"); }
});

test("both providers validate only final responses, correct in the same conversation/model at most twice", async () => {
  for (const provider of ["codex", "copilot"] as const) {
    const calls: any[] = [], statuses: string[] = [];
    let attempt = 0, polls = 0;
    const snapshot = (): AssistantConversation => ({ id: "same-thread", provider, model: "selected-model", reasoningEffort: "low", title: "View", folders: [], createdAt: 0, updatedAt: 0,
      turns: [{ id: `turn-${attempt}`, status: polls ? "completed" : "inProgress", items: [{ id: "answer", kind: "assistant", text: polls ? JSON.stringify(attempt < 3 ? { invalid: true } : statisticsView) : '{"partial":' }] }] });
    const result = await generateView({ input: { provider, model: "selected-model", reasoningEffort: "low", folders: [], message: "Documents" }, signal: new AbortController().signal, pollMs: 0,
      request: async <T>(_url: string, body?: any): Promise<T> => { if (body?.action === "prepare-view-generation") return { requestId: "prepared" } as T; calls.push(body); if (body) { attempt++; polls = 0; } else polls++; return snapshot() as T; },
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
        if (body?.action === "prepare-view-generation") return { requestId: "prepared" } as T;
        if (body?.action === "cancel-view-generation") return {} as T;
        sends++;
        if (mode === "transport") throw new Error("disconnected");
        if (mode === "cancel") controller.abort(new Error("stopped"));
        return { id: "thread", model: mode === "model" ? "other" : "chosen", reasoningEffort: "low", turns: [{ status: "completed", items: [{ kind: "assistant", text: '{}' }] }] } as T;
      }, snapshot: () => {}, status: () => {}, validate: async () => { if (mode === "validation-transport") throw new Error("Host disconnected"); throw new ViewValidationError("invalid binding"); },
    }));
    assert.equal(sends, mode === "invalid" ? 3 : 1);
  }
});
