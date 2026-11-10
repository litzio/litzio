import assert from "node:assert/strict";
import test from "node:test";
import { validateManifest, validatePluginSource } from "@litzio/plugin-sdk";
import { replySchema, REPLY_JSON_SCHEMA, type BuilderSpec } from "../shared/plugin-builder.ts";
import { generationIssue, githubIssuesPlugin } from "../server/plugin-builder-generate.ts";
import { createPluginBuilderService } from "../server/plugin-builder.ts";

const service = () => createPluginBuilderService({ connection: () => { throw new Error("scripted mode must not touch Codex"); }, plugins: undefined as never, mode: () => "scripted" });
const send = (s: ReturnType<typeof service>, body: object) => s.invoke("post", body) as Promise<any>;

test("scripted interview changes the form each round and every reply is schema-valid", async () => {
  const s = service();
  const r1 = await send(s, { action: "turn", intent: "start", message: "리치오 저장소의 GitHub 이슈를 보는 플러그인을 만들고 싶어" });
  assert.equal(r1.phase, "interview"); assert.equal(r1.backend.mode, "scripted");
  const r2 = await send(s, { action: "turn", sessionId: r1.sessionId, intent: "answers", answers: { auth: ["none"], repo: ["litzio/litzio"], features: ["list"] } });
  const r3 = await send(s, { action: "turn", sessionId: r1.sessionId, intent: "answers", answers: { state: ["open"], labels: [""], assignee: [""], prs: ["false"] } });
  assert.deepEqual([r1.round.title, r2.round.title, r3.round.title], ["연결 방식", "조회 조건", "표시 열"]);
  assert.notDeepEqual(r1.round.widgets.map((w: any) => w.id), r2.round.widgets.map((w: any) => w.id));
  const plan = await send(s, { action: "turn", sessionId: r1.sessionId, intent: "answers", answers: { columns: ["number", "title"], pageSize: ["10"] } });
  assert.equal(plan.phase, "plan");
  assert.equal(plan.plan.spec.pageSize, 10);
  for (const reply of [r1, r2, r3, plan]) assert.ok(replySchema.safeParse({ message: reply.message, phase: reply.phase, round: reply.round, decisions: reply.decisions.map(({ userEdited, ...d }: any) => d), plan: reply.plan }).success);
});

test("a user's decision edit changes the next question and survives later rounds", async () => {
  const s = service();
  const r1 = await send(s, { action: "turn", intent: "start" });
  const r2 = await send(s, { action: "turn", sessionId: r1.sessionId, intent: "answers", answers: { auth: ["none"], repo: ["litzio/litzio"], features: ["list"] }, edits: [{ id: "D2", value: "개인 액세스 토큰(PAT)", status: "confirmed" }] });
  assert.equal(r2.round.title, "토큰 사용 확인");
  assert.equal(r2.decisions.find((d: any) => d.id === "D2").userEdited, true);
  const r3 = await send(s, { action: "turn", sessionId: r1.sessionId, intent: "answers", answers: { tokenScope: ["read"], tokenFallback: ["true"] } });
  assert.equal(r3.round.title, "조회 조건");
  assert.equal(r3.decisions.find((d: any) => d.id === "D2").value, "개인 액세스 토큰(PAT)", "the user's value is never overwritten");
});

test("generated GitHub plugin is valid SDK source and refuses token specs", () => {
  const spec: BuilderSpec = { template: "github-issues", pluginName: "GitHub 이슈", pluginId: "github-issues", repo: "litzio/litzio", auth: "none", state: "open", labels: "", assignee: "", columns: ["number", "title", "state"], pageSize: 20, openQuestions: [] };
  assert.equal(generationIssue(spec), undefined);
  assert.match(generationIssue({ ...spec, auth: "token" })!, /Windows/);
  const { manifest, source } = githubIssuesPlugin(spec, "local.github-issues");
  const checked = validateManifest(manifest);
  assert.deepEqual(validatePluginSource(source, checked), []);
  assert.doesNotMatch(source, /Authorization|secrets/);
});

test("Codex output schema is strict: every property is required", () => {
  const walk = (node: any) => { if (node?.type === "object") { assert.equal(node.additionalProperties, false); assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort()); Object.values(node.properties).forEach(walk); } if (node?.type === "array") walk(node.items); };
  walk(REPLY_JSON_SCHEMA);
});

test("generated operation output passes the Host's publication checks (rows envelope, link column)", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const path = await import("node:path");
  const { compileSchema } = await import("@litzio/plugin-sdk");
  const { parseOperationRowResult, rowSchema } = await import("@litzio/core/views");
  const spec: BuilderSpec = { template: "github-issues", pluginName: "GitHub 이슈", pluginId: "github-issues", repo: "litzio/litzio", auth: "none", state: "open", labels: "", assignee: "", columns: ["number", "title", "labels"], pageSize: 3, openQuestions: [] };
  const { manifest, source } = githubIssuesPlugin(spec, "local.github-issues");
  const directory = mkdtempSync(path.join(import.meta.dirname, ".generated-"));
  const realFetch = globalThis.fetch;
  try {
    writeFileSync(path.join(directory, "host.js"), source);
    const issue = (n: number, extra: object = {}) => ({ number: n, title: `t${n}`, state: "open", user: { login: "u" }, labels: [{ name: "bug" }], assignee: null, comments: 0, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-02T00:00:00Z", html_url: `https://github.com/litzio/litzio/issues/${n}`, ...extra });
    const { activate } = await import(path.join(directory, "host.js"));
    const operation = manifest.contributes.operations.find(op => op.id === "issues")!;
    for (const body of [[issue(1), issue(2, { pull_request: {} })], [issue(1), issue(2), issue(3)]]) {
      globalThis.fetch = (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
      const result = await activate({ settings: { repo: "litzio/litzio" } }).operations.issues({ state: "열림" });
      assert.equal(compileSchema(operation.outputSchema)(result), true);
      const published = parseOperationRowResult(result, rowSchema.parse(operation.rowSchema)) as { rows: Record<string, unknown>[] };
      assert.ok(published.rows.every(row => !("pull_request" in row)));
    }
  } finally { globalThis.fetch = realFetch; rmSync(directory, { recursive: true, force: true }); }
});
