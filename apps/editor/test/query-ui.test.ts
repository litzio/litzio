import { createHostClient } from "../src/host-client.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { ViewInputError } from "@litzio/core/views-v2";
import { viewRequest, readViewCatalog } from "../src/views/view-api.ts";
import { createAssistantRequest } from "../src/assistant-api.ts";
import { inputIssueMessage, sourceFailure } from "../src/views/source-state.ts";
import { i18n } from "../src/i18n.ts";
test("assistant and view transports pass AbortSignal to fetch", async context => {
  const client = createHostClient("http://fixture.invalid");
  for (const surface of ["assistant", "view"]) {
    let received: AbortSignal | undefined;
    context.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => new Promise((_resolve, reject) => {
      received = init.signal!; received.addEventListener("abort", () => reject(received!.reason), { once: true });
    }));
    const controller = new AbortController();
    const run = surface === "assistant" ? createAssistantRequest(client)("/api/assistant/conversations", { action: "send" }, controller.signal) : viewRequest(client, { action: "validate", view: {} }, controller.signal);
    await Promise.resolve(); controller.abort(new Error("transport aborted"));
    await assert.rejects(run, /transport aborted/); assert.equal(received, controller.signal);
    context.mock.restoreAll();
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

// Host material ownership differs from Core row validation: no new Root grants,
// immutable read bytes and explicit context/output failures instead of sampling.
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
