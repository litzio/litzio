import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CodexAppServer, LineDecoder } from "../server/codex-app-server.ts";
import { AiAgentConnection, AGENT_INSTRUCTIONS } from "../server/ai-agent-connection.ts";

export const fakeServer = fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url));
test("stdio splits UTF-8 safely", () => {
  const messages: any[] = [], decoder = new LineDecoder(message => messages.push(message));
  const bytes = Buffer.from('{"result":"한글"}\n{"result":2}\n');
  for (const byte of bytes) decoder.push(Buffer.from([byte]));
  assert.deepEqual(messages, [{ result: "한글" }, { result: 2 }]);
});
test("one lazy process initializes once, preserves caller home and cwd, pages models and reports partial diagnostics", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "ai-connection-")), cwd = path.join(root, "assistant"), log = path.join(root, "rpc.jsonl");
  const connection = new AiAgentConnection(cwd, { bin: process.execPath, args: [fakeServer, log, "account-fail"] });
  t.after(async () => { await connection.close(); rmSync(root, { recursive: true, force: true }); });
  assert.equal(existsSync(log), false);
  const env = connection.environment(); assert.equal(env.cwd, cwd); assert.deepEqual(env.skills, []);
  assert.equal(readFileSync(env.instructions, "utf8"), AGENT_INSTRUCTIONS);
  const [models, diagnostics] = await Promise.all([connection.models(), connection.diagnostics()]);
  assert.deepEqual(models.models.map(model => model.model), ["gpt-6.1-sol", "chosen-model", "next-model"]);
  assert.equal(diagnostics.connected, true); assert.equal(diagnostics.accountError, "fixture error");
  assert.equal(diagnostics.rateLimits![0].windows[0].usedPercent, 28);
  assert.deepEqual(diagnostics.mcp, [{ name: "fixture", status: "unknown", authStatus: "notLoggedIn" }]);
  await connection.models();
  const notification = new Promise(resolve => connection.client.once("notification", (method, params) => resolve({ method, params })));
  await connection.client.request("notify"); assert.deepEqual(await notification, { method: "fixture/notification", params: { text: "한글" } });
  await assert.rejects(connection.client.request("fail"), /fixture error/);
  const lines = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
  assert.equal(lines.filter(line => line.pid).length, 1); assert.equal(lines[0].cwd, cwd);
  assert.equal(lines[0].home, process.env.CODEX_HOME ?? null);
  assert.equal(lines.filter(line => line.method === "initialize").length, 1);
  assert.equal(lines.filter(line => line.method === "initialized").length, 1);
  const pending = connection.client.request("hang"); await new Promise(resolve => setImmediate(resolve));
  const rejected = assert.rejects(pending, /closing/); await connection.close(); await rejected;
  assert.throws(() => process.kill(lines[0].pid, 0));
  await assert.rejects(connection.client.request("model/list"), /closed/);
});
test("malformed output, process loss and request timeout reject without replay", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "ai-transport-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const method of ["malformed", "exit", "hang"]) {
    const client = new CodexAppServer(root, { bin: process.execPath, args: [fakeServer], timeoutMs: 2000 });
    try { await client.connect(); await assert.rejects(client.request(method), method === "malformed" ? /Invalid/ : method === "exit" ? /exited/ : /timed out: hang/); }
    finally { await client.close(); }
  }
  const client = new CodexAppServer(root, { bin: path.join(root, "absent-codex") });
  try { await assert.rejects(client.connect(), /could not be executed/); } finally { await client.close(); }
});

test("installed CLI launcher paths with spaces support version diagnostics and reject old Codex before app-server launch", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "codex launcher ")), log = path.join(root, "rpc.jsonl");
  const bin = path.join(root, process.platform === "win32" ? "codex.cmd" : "codex");
  const launcher = (version: string) => {
    writeFileSync(bin, process.platform === "win32"
      ? `@echo off\r\nif "%~1"=="--version" (\r\necho codex-cli ${version}\r\nexit /b 0\r\n)\r\n"${process.execPath}" "${fakeServer}" "${log}"\r\n`
      : `#!/bin/sh\nif [ "$1" = "--version" ]; then echo codex-cli ${version}; exit 0; fi\nexec "${process.execPath}" "${fakeServer}" "${log}"\n`);
    if (process.platform !== "win32") chmodSync(bin, 0o755);
  };
  t.after(() => rmSync(root, { recursive: true, force: true }));
  launcher("0.165.0");
  const old = new CodexAppServer(root, { bin });
  try { await assert.rejects(old.connect(), /0.166.0 or later/); assert.equal(existsSync(log), false); } finally { await old.close(); }
  launcher("0.166.0");
  const current = new CodexAppServer(root, { bin });
  try { assert.equal(await current.version(), "codex-cli 0.166.0"); await current.connect(); assert.ok(existsSync(log)); }
  finally { await current.close(); }
});
