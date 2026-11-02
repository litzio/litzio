import { createInterface } from "node:readline";
import { appendFileSync } from "node:fs";
const [log, mode] = process.argv.slice(2);
const record = value => { if (log) appendFileSync(log, JSON.stringify(value) + "\n"); };
record({ pid: process.pid, cwd: process.cwd(), home: process.env.CODEX_HOME ?? null });
const send = message => process.stdout.write(JSON.stringify(message) + "\n");
const model = (name, efforts) => ({ id: name, model: name, displayName: name, description: "한국어 모델", defaultReasoningEffort: efforts[0], supportedReasoningEfforts: efforts.map(reasoningEffort => ({ reasoningEffort, description: reasoningEffort })) });
createInterface({ input: process.stdin }).on("line", line => {
  const message = JSON.parse(line); record(message);
  const { id, method, params } = message;
  if (!id) return;
  if (method === "hang") return;
  if (method === "exit") process.exit(3);
  if (method === "malformed") { process.stdout.write("not json\n"); return; }
  if (method === "fail" || mode === "account-fail" && method === "account/read") { send({ id, error: { message: "fixture error" } }); return; }
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
