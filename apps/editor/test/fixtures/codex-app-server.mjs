import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { appendFileSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
const [log, mode] = process.argv.slice(2);
const record = value => { if (log) appendFileSync(log, JSON.stringify(value) + "\n"); };
record({ pid: process.pid, cwd: process.cwd(), home: process.env.CODEX_HOME ?? null });
const send = message => process.stdout.write(JSON.stringify(message) + "\n");
const threadFile = path.join(process.cwd(), "fixture-threads.json");
const threads = existsSync(threadFile) ? JSON.parse(readFileSync(threadFile, "utf8")) : {};
const persist = () => writeFileSync(threadFile, JSON.stringify(threads));
const notify = (method, params) => send({ method, params });
const model = (name, efforts) => ({ id: name, model: name, displayName: name, description: "한국어 모델", defaultReasoningEffort: efforts[0], supportedReasoningEfforts: efforts.map(reasoningEffort => ({ reasoningEffort, description: reasoningEffort })) });
const toolPending = new Map();
createInterface({ input: process.stdin }).on("line", line => {
  const message = JSON.parse(line); record(message);
  const { id, method, params } = message;
  if (id === undefined) return;
  if (toolPending.has(id)) {
    const pending = toolPending.get(id); toolPending.delete(id);
    if (message.result && pending.params.method !== "unsupported") {
      const thread = threads[pending.params.threadId], turn = thread.turns.at(-1);
      const item = { type: "dynamicToolCall", id, namespace: null, tool: pending.params.tool, arguments: pending.params.arguments, status: "completed", ...message.result };
      turn.items.push(item); persist(); notify("item/completed", { threadId: thread.id, turnId: turn.id, item });
    }
    send({ id: pending.id, result: message }); return;
  }
  if (method === "fixture/cli") {
    const result = spawnSync(params.command, params.args, { encoding: "utf8", shell: process.platform === "win32", windowsHide: true, timeout: 10000 });
    send({ id, result: { status: result.status, stdout: result.stdout, stderr: result.stderr, path: process.env.PATH } }); return;
  }
  if (method === "fixture/tool") {
    const callId = randomUUID(), turn = threads[params.threadId].turns.at(-1);
    toolPending.set(callId, { id, params });
    send({ id: callId, method: params.method === "unsupported" ? "item/commandExecution/requestApproval" : "item/tool/call", params: { ...params, namespace: null, turnId: params.turnId ?? turn.id, callId } }); return;
  }
  if (method === "fixture/question") {
    const turn = threads[params.threadId].turns.at(-1);
    send({ id: params.requestId, method: "item/tool/requestUserInput", params: { threadId: params.threadId, turnId: turn.id, questions: params.questions } });
    send({ id, result: {} }); return;
  }
  if (method === "fixture/async-question") {
    const thread = threads[params.threadId], turn = thread.turns.at(-1);
    const item = { type: "agentMessage", id: params.itemId, text: params.text ?? "Travel question", delivery: "async", questions: params.questions };
    turn.items.push(item); persist();
    notify("item/started", { threadId: thread.id, turnId: turn.id, item });
    notify("item/completed", { threadId: thread.id, turnId: turn.id, item });
    send({ id, result: {} }); return;
  }
  if (method === "fixture/resolved") {
    notify("serverRequest/resolved", params); send({ id, result: {} }); return;
  }
  if (!method) return;
  if (method === "hang") return;
  if (method === "exit") process.exit(3);
  if (method === "malformed") { process.stdout.write("not json\n"); return; }
  if (method === "fail" || mode === "account-fail" && method === "account/read") { send({ id, error: { message: "fixture error" } }); return; }
  if (method === "skills/list") {
    if (mode === "skills-fail") { send({ id, error: { message: "skills unavailable" } }); return; }
    send({ id, result: { data: [{ cwd: process.cwd(), skills: [
      { name: "litzio-guide", description: "Explain Litzio", path: path.join(process.cwd(), ".agents/skills/litzio-guide/SKILL.md"), enabled: true },
      { name: "disabled", description: "Disabled skill", path: "/disabled/SKILL.md", enabled: false }
    ], errors: [{ path: "/broken/SKILL.md", message: "invalid frontmatter" }] }] } }); return;
  }
  if (method === "thread/start") {
    const thread = { id: randomUUID(), turns: [], createdAt: Math.floor(Date.now() / 1000), updatedAt: Math.floor(Date.now() / 1000), cwd: process.cwd(), preview: "", status: { type: "idle" } };
    threads[thread.id] = thread; persist(); send({ id, result: { thread, model: params.model, reasoningEffort: "medium" } }); return;
  }
  if (method === "thread/resume") { send({ id, result: { thread: threads[params.threadId], model: "gpt-6.1-sol", reasoningEffort: "medium", turnsBackwardsCursor: null, itemsBackwardsCursor: null } }); return; }
  if (method === "thread/turns/list") {
    const turns = threads[params.threadId].turns, offset = Number(params.cursor ?? 0);
    send({ id, result: { data: turns.slice(offset, offset + 1).map(turn => ({ ...turn, items: turn.items.map(item => item.type === "userMessage" ? { ...item, content: [
      { type: "text", text: item.content.filter(part => part.type === "text").map(part => part.text).join(""), text_elements: [] },
      ...item.content.filter(part => part.type === "localImage" || part.type === "image"),
    ] } : item) })), nextCursor: offset + 1 < turns.length ? String(offset + 1) : null, backwardsCursor: null } }); return;
  }
  if (method === "turn/start" || method === "turn/steer") {
    const thread = threads[params.threadId];
    const turn = method === "turn/start" ? { id: randomUUID(), status: "inProgress", items: [], itemsView: "full", error: null } : thread.turns.at(-1);
    if (method === "turn/steer" && (turn.id !== params.expectedTurnId || turn.status !== "inProgress")) { send({ id, error: { message: "No matching active turn" } }); return; }
    if (method === "turn/start") { thread.turns.push(turn); notify("turn/started", { threadId: thread.id, turn }); }
    const user = { type: "userMessage", id: randomUUID(), clientId: null, content: params.input }; turn.items.push(user);
    notify("item/completed", { threadId: thread.id, turnId: turn.id, item: user });
    if (method === "turn/start") {
      const reasoning = { type: "reasoning", id: randomUUID(), summary: ["Checking the opened document.", "Checking folders."], content: ["PRIVATE RAW REASONING"] };
      const tool = { type: "commandExecution", id: randomUUID(), command: "Get-Content notes.md", cwd: process.cwd(), status: "completed", aggregatedOutput: "fixture", exitCode: 0, durationMs: 1, commandActions: [] };
      notify("item/started", { threadId: thread.id, turnId: turn.id, item: { ...reasoning, summary: [] } });
      for (const delta of ["Checking the opened ", "document."]) notify("item/reasoning/summaryTextDelta", { threadId: thread.id, turnId: turn.id, itemId: reasoning.id, summaryIndex: 0, delta });
      const empty = { type: "reasoning", id: randomUUID(), summary: [], content: ["PRIVATE RAW REASONING"] };
      turn.items.push(reasoning, empty, tool);
      notify("item/completed", { threadId: thread.id, turnId: turn.id, item: empty });
      for (const item of [reasoning, tool]) notify("item/completed", { threadId: thread.id, turnId: turn.id, item });
      const answer = { type: "agentMessage", id: randomUUID(), text: "Partial answer", phase: "final_answer" }; turn.items.push(answer);
      notify("item/started", { threadId: thread.id, turnId: turn.id, item: { ...answer, text: "" } });
      notify("item/agentMessage/delta", { threadId: thread.id, turnId: turn.id, itemId: answer.id, delta: answer.text });
      notify("thread/tokenUsage/updated", { threadId: thread.id, turnId: turn.id, tokenUsage: { total: { totalTokens: 2000 }, last: { totalTokens: 810 }, modelContextWindow: 1000 } });
    }
    persist(); send({ id, result: method === "turn/start" ? { turn } : { turnId: turn.id } }); return;
  }
  if (method === "turn/interrupt" || method === "fixture/finish") {
    const thread = threads[params.threadId], turn = thread.turns.at(-1);
    if (method === "fixture/finish" && typeof params.finalText === "string") for (const item of turn.items.filter(item => item.type === "agentMessage")) item.text = params.finalText;
    turn.status = method === "turn/interrupt" ? "interrupted" : "completed";
    for (const item of turn.items.filter(item => item.type === "agentMessage")) notify("item/completed", { threadId: thread.id, turnId: turn.id, item });
    notify("turn/completed", { threadId: thread.id, turn }); persist(); send({ id, result: {} }); return;
  }
  const responses = {
    initialize: { userAgent: "fixture" },
    "model/list": params?.cursor ? { data: [model("next-model", ["low"])], nextCursor: null } : { data: [model("gpt-6.1-sol", ["medium", "high"]), model("chosen-model", ["xhigh"])], nextCursor: "page-2" },
    "account/read": { account: mode === "logged-out" ? null : { type: "chatgpt", email: "fixture@example.invalid", planType: "plus" } },
    "account/rateLimits/read": { rateLimits: { primary: { usedPercent: 28, windowDurationMins: 300, resetsAt: 1900000000 }, secondary: null }, rateLimitsByLimitId: null },
    "mcpServerStatus/list": { data: [{ name: "fixture", runtimeStatus: null, authStatus: "notLoggedIn" }], nextCursor: null },
  };
  send({ id, result: responses[method] ?? { text: "안녕하세요", method } });
  if (method === "notify") send({ method: "fixture/notification", params: { text: "한글" } });
}).on("close", () => process.exit(0));
