import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { validateManifest } from "@litzio/plugin-sdk";
import { PLUGIN_BUILDER, REPLY_JSON_SCHEMA, replySchema, type BuilderApproveResult, type BuilderBackend, type BuilderDecision, type BuilderInstallStep, type BuilderReply, type BuilderSpec, type BuilderTurnRequest, type BuilderTurnResult } from "../shared/plugin-builder.ts";
import { generationIssue, githubIssuesPlugin } from "./plugin-builder-generate.ts";
import { decisionsAfter, scriptedReply, scriptedRoundKey, type ScriptState } from "./plugin-builder-script.ts";
import type { ProviderConnections } from "./provider-connections.ts";
import type { PluginService } from "./plugin-service.ts";

/** The reference model for assistant plugin authoring checks (AGENTS.md, #1421). */
export const BUILDER_MODEL = { model: "gpt-6.1-terra", effort: "high" } as const;
const TURN_TIMEOUT_MS = 120_000;

export const BUILDER_INSTRUCTIONS = `You are the Litzio assistant ("비서") running the Plugin Builder interview. Reply ONLY with one JSON object that matches the supplied output schema. Write every user-facing string in Korean 해요체 (polite, short).
Goal: agree on a read-only Litzio community plugin with the user before anything is built. You never write code and never claim anything is installed; the human approves first.
Rules:
- The client renders only these widget types: single, multi, text, toggle. Widget ids are short camelCase, option values are short stable tokens. Max 5 widgets per round. Never repeat a question the user already answered.
- Each round must differ from the previous one and drill into the technical details that are still ambiguous (service flavour, target repo or base URL, authentication, read vs write, filters, columns, page size, rate limits). Be persistent like the grill-me skill, but ask at most 3 interview rounds in total, then switch to phase "plan".
- decisions: return the COMPLETE current list every turn. Keep stable ids D1, D2, ... Statuses: confirmed (user chose it), proposed (you suggest it), open (unresolved). Give a one-line reason. "field" links a decision to a spec field (target, auth, repo, scope, features, state, labels, assignee, columns, limit, other).
- Decisions listed under userDecisionEdits were edited by the user in the decision panel. They are binding: keep their value and status exactly, never revisit them unless they contradict a hard limit, and let them change which questions you ask next and what the plan contains. Say in "message" and in round.notice how an edit changed the next question.
- The generator can currently build ONLY template "github-issues": unauthenticated, read-only, public repos through https://api.github.com/repos/{owner}/{repo}/issues, columns from number,title,state,author,labels,assignee,comments,updated,created. Plugin secrets are Windows-Host only, so auth "token" cannot be generated on this Linux Host: say so and keep it open or propose public-only. For any other service use template "other" and list what is missing in openQuestions.
- In an interview round set plan.nodes and plan.edges to empty arrays and plan.spec to your best current guess (pluginName and pluginId may be empty). In phase "plan" set round.widgets to an empty array, give 5-7 plan nodes (kinds user, settings, plugin, api, result, health, document) with edges, and a complete plan.spec: pluginId a lowercase slug, repo as owner/name, columns including number, pageSize between 5 and 30.
- Never ask for secrets. Never invent API behaviour that the generator cannot do.`;

type Session = { id: string; threadId?: string; turn: number; roundKey?: string; lastRound?: BuilderReply["round"]; reply?: BuilderReply; message: string; script: ScriptState; backend: BuilderBackend; approved?: BuilderApproveResult };

export function createPluginBuilderService(options: { connection: () => ProviderConnections; plugins: PluginService; mode?: () => string | undefined; cwd?: string }) {
  const sessions = new Map<string, Session>();
  const session = (id?: string): Session => {
    if (id) { const found = sessions.get(id); if (!found) throw new Error("Unknown builder session."); return found; }
    const created: Session = { id: randomUUID(), turn: 0, message: "", backend: { mode: "scripted" }, script: { answers: {}, answered: new Set(), decisions: [], pinned: new Map(), userMessage: "" } };
    sessions.set(created.id, created); return created;
  };
  let catalog: Promise<{ ok: boolean; reason?: string }> | undefined;
  const modelAvailable = () => catalog ??= (async () => {
    const models = await options.connection().models("codex");
    const model = models.models.find(item => item.model === BUILDER_MODEL.model);
    if (!model) return { ok: false, reason: `model ${BUILDER_MODEL.model} is not in the Codex model list (${models.models.map(item => item.model).join(", ")})` };
    if (!model.supportedReasoningEfforts.some(effort => effort.reasoningEffort === BUILDER_MODEL.effort)) return { ok: false, reason: `effort ${BUILDER_MODEL.effort} is not supported by ${BUILDER_MODEL.model}` };
    return { ok: true };
  })().catch(error => { catalog = undefined; return { ok: false, reason: (error as Error).message }; });

  /** One Codex turn on an ephemeral read-only thread with no dynamic tools. The reply is a schema-constrained JSON message. */
  async function codexTurn(s: Session, prompt: string): Promise<string> {
    const connection = options.connection();
    connection.environment();
    const client = connection.client;
    await client.connect();
    const cwd = options.cwd ?? path.join(connection.cwd, "plugin-builder");
    mkdirSync(cwd, { recursive: true });
    if (!s.threadId) {
      const started = await client.request("thread/start", { model: BUILDER_MODEL.model, cwd, approvalPolicy: "never", sandbox: "read-only", ephemeral: true, developerInstructions: BUILDER_INSTRUCTIONS });
      s.threadId = started.thread.id;
    }
    const threadId = s.threadId!;
    let message = "", failure: string | undefined, done!: () => void, turnId = "";
    const finished = new Promise<void>(resolve => { done = resolve; });
    const onNotification = (method: string, params: any) => {
      if (params?.threadId !== threadId) return;
      if (method === "item/completed" && params.item?.type === "agentMessage") message = params.item.text;
      else if (method === "error" && !params.willRetry) { failure = params.error?.message ?? "Codex error"; done(); }
      else if (method === "turn/completed") { if (params.turn?.status === "failed") failure = params.turn.error?.message ?? "Codex turn failed"; else if (params.turn?.status === "interrupted") failure = "Codex turn interrupted"; done(); }
    };
    client.on("notification", onNotification);
    const timer = setTimeout(() => { failure = "Codex turn timed out"; done(); if (turnId) void client.request("turn/interrupt", { threadId, turnId }).catch(() => {}); }, TURN_TIMEOUT_MS);
    try {
      const started = await client.request("turn/start", { threadId, input: [{ type: "text", text: prompt, text_elements: [] }], cwd, model: BUILDER_MODEL.model, effort: BUILDER_MODEL.effort, summary: "none",
        approvalPolicy: "never", sandboxPolicy: { type: "readOnly", networkAccess: false }, outputSchema: REPLY_JSON_SCHEMA });
      turnId = started.turn.id;
      await finished;
    } finally { clearTimeout(timer); client.off("notification", onNotification); }
    if (failure) throw new Error(failure);
    if (!message.trim()) throw new Error("Codex returned no message");
    return message;
  }

  function applyPinned(s: Session, reply: BuilderReply): BuilderReply {
    const decisions: BuilderDecision[] = reply.decisions.map(d => ({ ...d }));
    for (const [id, edit] of s.script.pinned) {
      const index = decisions.findIndex(d => d.id === id);
      const current = s.script.decisions.find(d => d.id === id);
      if (index >= 0) decisions[index] = { ...decisions[index]!, ...(edit.value !== undefined ? { value: edit.value } : {}), ...(edit.status ? { status: edit.status } : {}), userEdited: true };
      else if (current) decisions.push({ ...current, ...(edit.value !== undefined ? { value: edit.value } : {}), ...(edit.status ? { status: edit.status } : {}), userEdited: true });
    }
    decisions.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
    const spec: BuilderSpec = { ...reply.plan.spec };
    for (const d of decisions.filter(d => d.userEdited)) {
      if (d.field === "repo") { const m = /[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+/.exec(d.value); if (m) spec.repo = m[0]; }
      if (d.field === "state") spec.state = /전체|all/i.test(d.value) ? "all" : /닫|closed/i.test(d.value) ? "closed" : "open";
      if (d.field === "labels") spec.labels = /^(없음|없어요|none|-)$/i.test(d.value.trim()) ? "" : d.value.trim();
      if (d.field === "assignee") spec.assignee = /^(없음|없어요|none|-)$/i.test(d.value.trim()) ? "" : d.value.trim();
      if (d.field === "auth") spec.auth = /토큰|PAT|token/i.test(d.value) && !/없|불필요|no token/i.test(d.value) ? "token" : "none";
    }
    return { ...reply, decisions, plan: { ...reply.plan, spec } };
  }

  function promptFor(s: Session, request: BuilderTurnRequest): string {
    const edits = [...s.script.pinned.entries()].map(([id, edit]) => ({ id, title: s.script.decisions.find(d => d.id === id)?.title, ...edit }));
    const answers = s.lastRound ? s.lastRound.widgets.map(w => ({ widgetId: w.id, label: w.label, answer: s.script.answers[w.id] ?? null })) : [];
    return JSON.stringify({ intent: request.intent, turn: s.turn + 1, userMessage: request.message ?? "", previousRoundTitle: s.lastRound?.title ?? null, answersToPreviousRound: answers,
      userDecisionEdits: edits, currentDecisions: s.script.decisions.map(d => ({ id: d.id, title: d.title, value: d.value, status: d.status, field: d.field })) });
  }

  async function turn(request: BuilderTurnRequest & { mode?: string }): Promise<BuilderTurnResult> {
    const started = Date.now();
    const s = session(request.sessionId);
    if (request.intent === "start" && request.message) s.script.userMessage = request.message;
    // User answers and decision edits are applied before any backend runs, so both backends see the same state.
    if (request.intent === "answers" && s.lastRound && s.roundKey) {
      for (const w of s.lastRound.widgets) s.script.answers[w.id] = request.answers?.[w.id] ?? w.defaults;
      s.script.answered.add(s.roundKey);
      s.script.decisions = decisionsAfter(s.script, s.roundKey);
    }
    if (request.intent === "revise") s.script.answered.delete("columns");
    for (const edit of request.edits ?? []) {
      if (!/^D[0-9]{1,2}$/.test(edit.id)) throw new Error("Invalid decision id.");
      const previous = s.script.pinned.get(edit.id) ?? {};
      s.script.pinned.set(edit.id, { ...previous, ...(edit.value !== undefined ? { value: String(edit.value).slice(0, 160) } : {}), ...(edit.status ? { status: edit.status } : {}) });
    }
    const configured = request.mode ?? options.mode?.() ?? process.env.LITZIO_PLUGIN_BUILDER_MODE;
    let reply: BuilderReply | undefined, backend: BuilderBackend = { mode: "scripted" };
    if (configured !== "scripted") {
      const available = await modelAvailable();
      if (!available.ok) backend = { mode: "scripted", fallbackReason: available.reason };
      else {
        let prompt = promptFor(s, request), lastError = "";
        for (let attempt = 0; attempt < 2 && !reply; attempt++) {
          try {
            const raw = await codexTurn(s, attempt ? `${prompt}\n\nYour previous reply was rejected: ${lastError}. Reply again with a valid JSON object only.` : prompt);
            const parsed = replySchema.safeParse(JSON.parse(raw));
            if (parsed.success) reply = parsed.data; else lastError = parsed.error.issues.slice(0, 4).map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
          } catch (error) { lastError = (error as Error).message; if (!(error instanceof SyntaxError) && !/timed out/.test(lastError)) break; }
        }
        backend = reply ? { mode: "codex", model: BUILDER_MODEL.model, effort: BUILDER_MODEL.effort } : { mode: "scripted", fallbackReason: lastError.slice(0, 300) };
      }
    }
    if (!reply) reply = scriptedReply(s.script);
    reply = applyPinned(s, reply);
    if (reply.phase === "interview") { s.lastRound = reply.round; s.roundKey = backend.mode === "scripted" ? scriptedRoundKey(reply.round) : `codex-${s.turn + 1}`; }
    s.script.decisions = reply.decisions; s.reply = reply; s.backend = backend; s.turn++;
    return { ...reply, sessionId: s.id, turn: s.turn, decisions: reply.decisions, backend, turnMs: Date.now() - started };
  }

  /** Human approval is the only entry to generation. Everything below is the official plugin management path. */
  async function approve(sessionId: string): Promise<BuilderApproveResult> {
    const s = session(sessionId);
    if (s.approved?.ok) return s.approved;
    const steps: BuilderInstallStep[] = [];
    const step = (id: string, label: string, ok: boolean, detail?: string) => { steps.push({ id, label, ok, ...(detail ? { detail } : {}) }); return ok; };
    const fail = (limitation?: string): BuilderApproveResult => ({ ok: false, steps, howTo: [], ...(limitation ? { limitation } : {}) });
    if (!s.reply || s.reply.phase !== "plan") throw new Error("There is no plan to approve yet.");
    const spec = s.reply.plan.spec;
    const issue = generationIssue(spec);
    if (issue) { step("check", "생성 가능 여부 확인", false, issue); return fail(issue); }
    await options.plugins.start();
    const host = options.plugins.host;
    try {
      const installed = new Set((await host.list()).map((item: any) => item.id));
      const slug = spec.pluginId || "github-issues";
      let id = `local.${slug}`, n = 1;
      while (installed.has(id)) id = `local.${slug}-${++n}`;
      const generated = githubIssuesPlugin(spec, id);
      validateManifest(generated.manifest);
      await host.invoke("scaffold", { id, template: "query" });
      const directory = path.join(host.authoringPath()!, id);
      writeFileSync(path.join(directory, "litzio-plugin.json"), JSON.stringify(generated.manifest, null, 2) + "\n");
      writeFileSync(path.join(directory, "host.js"), generated.source);
      step("generate", "플러그인 파일 생성 (템플릿 · 공개 SDK)", true, directory);
      const validation = await host.invoke("validate", { directory }) as { valid: boolean; errors: { kind: string }[] };
      if (!step("validate", "정적 검증", validation.valid, validation.errors.map(e => e.kind).join("; "))) return fail();
      await host.invoke("register", { directory });
      const registered = (await host.list()).find((item: any) => item.id === id) as any;
      step("register", "Host에 등록", !!registered);
      await host.invoke("settings", { id, settings: { repo: spec.repo } });
      await host.invoke("trust", { id, registrationId: registered.registrationId, digest: undefined });
      await host.invoke("enable", { id, registrationId: registered.registrationId, trust: true });
      step("enable", "신뢰 후 활성화", true, "사용자 승인에 따라 이 플러그인만 신뢰했어요.");
      const health = await host.invokeOperation(`${id}.connection`, {}) as any;
      step("health", "연결 확인 (GitHub, 토큰 없음)", health.result?.ok === true, health.result?.message ?? health.error ?? "응답 없음");
      const query = { state: ({ open: "열림", closed: "닫힘", all: "전체" } as const)[spec.state], ...(spec.labels ? { labels: spec.labels } : {}), ...(spec.assignee ? { assignee: spec.assignee } : {}) };
      // The unauthenticated GitHub limit is shared per egress IP; one patient retry, never a loop.
      let listed = await host.invokeOperation(`${id}.issues`, query) as any;
      if (listed.error) { await new Promise(resolve => setTimeout(resolve, 2500)); listed = await host.invokeOperation(`${id}.issues`, query) as any; }
      const result = listed.result;
      const ok = !!result && Array.isArray(result.rows);
      step("sample", "실제 이슈 조회", ok, ok ? `${result.rows.length}건 · ${spec.repo}` : listed.error ?? "응답 없음");
      const outcome: BuilderApproveResult = { ok: steps.every(item => item.ok), pluginId: id, directory, steps,
        ...(ok ? { sample: { total: result.total, truncated: result.truncated, rows: result.rows.slice(0, 5) } } : {}),
        howTo: [`왼쪽 사이드바의 "${spec.pluginName || "GitHub 이슈"}"를 열면 이슈 표가 나와요.`, "상태·라벨·담당자를 바꾸고 '조회'를 누르면 다시 불러와요.", "번호를 누르면 GitHub의 이슈 페이지가 열려요.", "비서에게 \"열린 이슈 보여 줘\"라고 물어도 같은 조회를 써요.", "설정 > 플러그인에서 저장소를 바꾸거나 끌 수 있어요."] };
      s.approved = outcome; return outcome;
    } catch (error) {
      step("error", "설치 중 오류", false, (error as Error).message.slice(0, 200)); return fail();
    }
  }

  const invoke = async (operation: string, args: any = {}): Promise<unknown> => {
    if (operation === "turn") return turn(args);
    if (operation === "approve") return approve(String(args.sessionId));
    throw new Error("Unknown plugin builder operation.");
  };
  const route = (url: string): Record<string, string> | undefined => url === PLUGIN_BUILDER.route ? { POST: "post" } : undefined;
  return { route, invoke: (_op: string, args: any) => invoke(args?.action === "approve" ? "approve" : "turn", args), close() { sessions.clear(); } };
}
export type PluginBuilderService = ReturnType<typeof createPluginBuilderService>;
