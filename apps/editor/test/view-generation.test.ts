import assert from "node:assert/strict";
import test from "node:test";
import { generateView } from "../src/views/generate-view.ts";
import { statisticsView, ViewValidationError } from "../src/views/view-api.ts";
import { queryViewSchema, validateCatalogView, compileViewInputSchema, VIEW_LIMITS } from "@litzio/core/views-v2";
import { builtinViewOperations } from "@litzio/core/views";
import type { AssistantConversation } from "../shared/assistant.ts";
import { AssistantViewGenerations } from "../server/assistant-view-generations.ts";
import { createAssistantRequest } from "../src/assistant-api.ts";
import { createHostClient } from "../src/host-client.ts";
import { viewRequest, readViewCatalog } from "../src/views/view-api.ts";
import { ViewInputError } from "@litzio/core/views-v2";
import { sourceFailure, inputIssueMessage } from "../src/views/source-state.ts";
import { i18n } from "../src/i18n.ts";

const validateView = (value: unknown) => queryViewSchema.parse(validateCatalogView(value));

test("generation context accepts fixed args and InputForm queries and completed-bundle review definitions", async () => {
  const { viewGenerationContext, VIEW_GENERATION_CONTEXT } = await import("../shared/view-generation.ts");
  for (const catalog of [VIEW_GENERATION_CONTEXT.catalog, viewGenerationContext(builtinViewOperations).catalog]) {
    const accepts = compileViewInputSchema(catalog.schema);
    const fixed = validateView(statisticsView);
    assert.equal(accepts(fixed), true);
    assert.equal(accepts({ ...fixed, form: { component: "InputForm", source: "stats", fields: [], submit: { component: "SubmitButton", label: "Search" } } }), true);
    assert.equal(accepts({ kind: "litzio-view", schemaVersion: 2, catalog: "litzio-v2", profile: "review", title: "Review", refresh: "manual",
      sources: { review: { plugin: "example.demo", review: "compare", bundleRef: "bundle-1" } },
      layout: { component: "Panel", direction: "vertical", children: [{ component: "PageSurface", title: "Page", source: "review" }] } }), true);
    assert.equal(catalog.limits.inputs, VIEW_LIMITS.inputs);
  }
});

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
    assert.ok(statuses.some(value => value.includes("뷰 명세 수정 중"))); assert.ok(statuses.includes("뷰 명세 검증 완료 · 수정: 1/2")); assert.match(messages[1], /수정 1\/2/);
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
    assert.equal(result.schemaVersion, 2); assert.equal(attempt, 3);
    const sends = calls.filter(Boolean);
    assert.ok(sends.every(call => call.model === "selected-model" && call.provider === provider && call.viewGeneration));
    assert.equal(sends[1].id, "same-thread"); assert.equal(sends[2].id, "same-thread");
    assert.match(sends[1].message, /correction 1\/2/); assert.match(sends[2].message, /correction 2\/2/);
    assert.equal(statuses.filter(s => s.startsWith("Correcting view")).length, 2);
    assert.ok(statuses.every(s => !s.includes("Error:") && !s.includes("invalid")));
    assert.deepEqual(sends.map(call => call.viewGenerationCorrection), [0, 1, 2]);
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

test("V2 transport uses the sole catalog envelope and distinguishes pointer input, form and unavailable errors", async () => {
  let reply: unknown = { catalog: { operations: [] }, receipt: { outcome: "success" } };
  let status = 200;
  const client = { request: async (path: string, init: RequestInit) => {
    assert.equal(path, "/api/views");
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(String(init.body)), { action: "catalog" });
    return new Response(JSON.stringify(reply), { status });
  } } as unknown as import("../src/host-client.ts").HostClient;
  assert.deepEqual(await readViewCatalog(client), { operations: [] });
  status = 400;
  for (const inputIssues of [[{ field: "/text", keyword: "pattern" }], [{ keyword: "type" }], []]) {
    reply = { error: "SECRET response body", code: "invalid-input", inputIssues, receipt: { outcome: "failure" } };
    await assert.rejects(readViewCatalog(client), error => error instanceof ViewInputError && JSON.stringify(error.inputIssues) === JSON.stringify(inputIssues) && !error.message.includes("SECRET"));
  }
  reply = { code: "unavailable", errorKind: "failed", error: "SECRET removed field", receipt: { outcome: "failure" } };
  await assert.rejects(readViewCatalog(client), error => sourceFailure(error).state === "unavailable" && !sourceFailure(error).message.includes("SECRET"));
});

test("field advice uses keywords and public limits without echoing input or pattern text", async () => {
  const language = i18n.language;
  try {
    await i18n.changeLanguage("en");
    const schema = { format: "date", minimum: 1, maximum: 20, minLength: 3, maxLength: 12, pattern: "SECRET" };
    for (const [keyword, message] of [["format", "Enter a valid date (YYYY-MM-DD)."], ["minimum", "Enter a value of at least 1."], ["maximum", "Enter a value of at most 20."], ["minLength", "Use at least 3 characters."], ["maxLength", "Use at most 12 characters."], ["pattern", "Use the required format."], ["required", "Enter a value."], ["unknown", "Check this value against the operation requirements."]]) {
      assert.equal(inputIssueMessage(keyword, schema), message);
      assert.ok(!inputIssueMessage(keyword, schema).includes("SECRET"));
    }
    assert.equal(inputIssueMessage("minimum"), "Check this value against the operation requirements.");
    assert.equal(inputIssueMessage("format", { format: "email" }), "Check this value against the operation requirements.");
    await i18n.changeLanguage("ko");
    assert.equal(inputIssueMessage("minimum", schema), "1 이상의 값을 입력하세요.");
  } finally { await i18n.changeLanguage(language); }
});

// D3: destination identity is an app boundary, distinct from provider cancellation tests above.
test('destination delivery rejects closed, replaced and disconnected targets', async () => {
  const { ViewDestinationRegistry } = await import('../src/views/view-destination.ts');
  const registry = new ViewDestinationRegistry(), applied: unknown[] = [];
  const destination = {kind:'document' as const,id:'document-a',hostId:'host-a',owner:'litzio.assistant',root:'reports'};
  const view = {profile:'query',owner:'litzio.assistant'} as never;
  registry.register(destination.id, view => applied.push(view));
  const old=registry.begin(destination), current=registry.begin(destination);
  assert.equal(old.signal.aborted,true); assert.equal(registry.apply(old,view),false);
  assert.equal(registry.apply(current,{profile:"query",owner:"other.owner"} as never),false);
  assert.equal(registry.apply(current,view),true);
  assert.equal(registry.apply(current,view),false);
  registry.invalidate(destination.id); assert.equal(registry.apply(current,view),false);
  registry.register(destination.id,view=>applied.push(view));
  const changed=registry.begin({...destination,hostId:'host-b'});
  assert.equal(registry.apply(current,view),false);
  registry.invalidateHost('host-b'); assert.equal(changed.signal.aborted,true);
  assert.equal(registry.apply(changed,view),false); assert.equal(applied.length,1);
});

test('read table keeps source order stable, treats zero/false as values and combines typed filters', async () => {
  const { tableRows } = await import('../src/components/data-table-model.ts');
  const rows=[{name:'same',n:0,b:false},{name:'same',n:3,b:true},{name:'',n:null,b:null},{name:'a',n:1,b:false}];
  const fields={name:{type:'string' as const},n:{type:'number' as const},b:{type:'boolean' as const}};
  const original=structuredClone(rows);
  assert.deepEqual(tableRows(rows,{}, {column:'n',descending:true}, fields,'en').map(r=>r.n),[3,1,0,null]);
  assert.deepEqual(tableRows(rows,{}, {column:'name',descending:true}, fields,'en').map(r=>r.n),[0,3,1,null]);
  const filter={mode:'contains',text:'',values:[],min:'0',max:'1',empty:false};
  assert.deepEqual(tableRows(rows,{n:filter,b:{...filter,min:'',max:'',text:'false'}},undefined,fields,'en').map(r=>r.n),[0,1]);
  assert.equal(tableRows(rows,{n:{...filter,mode:'empty',empty:true}},undefined,fields,'en').length,1);
  assert.deepEqual(rows,original);
});
