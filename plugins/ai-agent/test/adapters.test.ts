import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { listenForFetch } from "@litzio/plugin-api/testing";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { AiWorkerRequest } from "@litzio/plugin-api/ai";
import { codexArgs, codexPermissionArgs, runInSnapshot, taskPrompt } from "../src/adapters.ts";

test("snapshot contains only requested, hashed files; control files stay separate and both directories are cleaned on every outcome", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ai-adapter-test-"));
  try {
    const source = path.join(root, "source.txt"); writeFileSync(source, "requested material"); writeFileSync(path.join(root, "outside.txt"), "outside sentinel");
    for (const outcome of ["success", "failure", "cancelled"]) {
      const work: AiWorkerRequest = { type: "ai-task", request: { id: "test", caller: "fixture", task: "inspect", baseline: "opaque", instruction: "Feature instruction", input: { small: true }, schema: { type: "object" }, materials: [{ path: source, name: "data.txt" }] },
        materials: [{ path: source, name: "data.txt", sha256: createHash("sha256").update(readFileSync(source)).digest("hex") }], temporary: { snapshot: path.join(root, `${outcome}-snapshot`), control: path.join(root, `${outcome}-control`) } };
      const controller = new AbortController();
      const run = runInSnapshot(work, { async status() { throw new Error("unused"); }, async run(value, signal) {
        assert.deepEqual(readdirSync(value.temporary.snapshot), ["data.txt"]);
        assert.equal(readFileSync(path.join(value.temporary.snapshot, "data.txt"), "utf8"), "requested material");
        assert.deepEqual(readdirSync(value.temporary.control), ["schema.json"]);
        const args = codexArgs(value);
        assert.equal(args[args.indexOf("--cd") + 1], value.temporary.snapshot);
        for (const flag of ["--output-schema", "--output-last-message"]) assert.equal(path.dirname(args[args.indexOf(flag) + 1]), value.temporary.control);
        const prompt = taskPrompt(value);
        assert.ok(prompt.indexOf("Feature instructions:") > prompt.indexOf("caller owns domain validation"));
        assert.ok(!prompt.includes(source)); assert.ok(!prompt.includes("opaque"));
        if (outcome === "failure") throw new Error("fixture failure");
        if (outcome === "cancelled") { controller.abort(); signal.throwIfAborted(); }
        return "{}";
      } }, controller.signal);
      if (outcome === "success") assert.equal(await run, "{}"); else await assert.rejects(run);
      assert.equal(existsSync(work.temporary.snapshot), false); assert.equal(existsSync(work.temporary.control), false);
    }
    assert.equal(readFileSync(source, "utf8"), "requested material");
    assert.equal(readFileSync(path.join(root, "outside.txt"), "utf8"), "outside sentinel");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Codex's actual exec harness retains the core shell environment and reads the snapshot without a model call", { skip: process.env.LITZIO_AI_SANDBOX_TEST !== "1" }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ai-harness-test-")), snapshot = path.join(root, "snapshot"), control = path.join(root, "control");
  mkdirSync(snapshot); mkdirSync(control); writeFileSync(path.join(snapshot, "material.txt"), "core-environment-read-proof");
  writeFileSync(path.join(control, "schema.json"), '{"type":"object","properties":{"value":{"type":"string"}},"required":["value"],"additionalProperties":false}');
  let issued = false, output = "";
  const server = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk.toString();
    if (req.url === "/v1/responses") {
      const value = JSON.parse(body);
      if (!issued) {
        issued = true;
        const item = { type: "function_call", id: "fc_read", call_id: "read", name: "exec_command", arguments: JSON.stringify({
          cmd: process.platform === "win32" ? "Get-Content -LiteralPath material.txt" : "cat material.txt", yield_time_ms: 1000, max_output_tokens: 200,
        }) };
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        for (const event of [
          { type: "response.created", response: { id: "read", status: "in_progress", output: [] } },
          { type: "response.output_item.added", output_index: 0, item },
          { type: "response.output_item.done", output_index: 0, item },
          { type: "response.completed", response: { id: "read", status: "completed", output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
        ]) res.write(`data: ${JSON.stringify(event)}\n\n`);
        res.end(); return;
      }
      output = value.input.filter((item: any) => item.type === "function_call_output").map((item: any) => item.output).join("\n");
    }
    // End after capturing the local tool result. This server never contacts a model.
    res.writeHead(400, { "Content-Type": "application/json" }); res.end('{"error":{"message":"Fixture complete","type":"invalid_request_error"}}');
  });
  await listenForFetch(server);
  let child: ReturnType<typeof spawn> | undefined;
  try {
    const args = codexArgs({ type: "ai-task", request: {} as any, materials: [], temporary: { snapshot, control } }); args.pop();
    args.push("-c", 'model_provider="fixture"', "-c", 'model_providers.fixture.name="Fixture"', "-c", 'model_providers.fixture.wire_api="responses"',
      "-c", `model_providers.fixture.base_url="http://127.0.0.1:${(server.address() as { port: number }).port}/v1"`, "-c", "model_providers.fixture.request_max_retries=0", "-c", "model_providers.fixture.stream_max_retries=0", "-");
    child = spawn("codex", args, { cwd: snapshot, windowsHide: true, stdio: ["pipe", "ignore", "ignore"] });
    child.stdin!.end("Run the fixture tool.");
    const timer = setTimeout(() => child?.kill(), 15_000);
    try { await new Promise<void>((resolve, reject) => { child!.once("error", reject); child!.once("close", () => resolve()); }); } finally { clearTimeout(timer); }
    assert.match(output, /Process exited with code 0/u); assert.match(output, /core-environment-read-proof/u);
    assert.equal(readFileSync(path.join(snapshot, "material.txt"), "utf8"), "core-environment-read-proof");
  } finally { child?.kill(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); rmSync(root, { recursive: true, force: true }); }
});

test("Codex command sandbox reads the snapshot and denies outside files, writes and network (no model invocation)", { skip: process.env.LITZIO_AI_SANDBOX_TEST !== "1" }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ai-sandbox-test-")), snapshot = path.join(root, "snapshot");
  mkdirSync(snapshot);
  writeFileSync(path.join(snapshot, "inside.txt"), "inside"); writeFileSync(path.join(root, "outside.txt"), "outside");
  let received = 0;
  const server = createServer((_, res) => { received++; res.end("network sentinel"); });
  await listenForFetch(server);
  try {
    const configuration = [...codexPermissionArgs(), "sandbox", "--permission-profile", "ai-task", "-C", snapshot, "--"];
    const read = (file: string) => process.platform === "win32" ? ["cmd.exe", "/d", "/c", "type", file] : ["/bin/cat", file];
    assert.equal(execFileSync("codex", [...configuration, ...read("inside.txt")], { encoding: "utf8", windowsHide: true }).trim(), "inside");
    assert.notEqual(spawnSync("codex", [...configuration, ...read(path.join(root, "outside.txt"))], { windowsHide: true }).status, 0);
    const write = process.platform === "win32" ? ["cmd.exe", "/d", "/c", "echo denied > denied.txt"] : ["/bin/sh", "-c", "echo denied > denied.txt"];
    assert.notEqual(spawnSync("codex", [...configuration, ...write], { windowsHide: true }).status, 0);
    assert.equal(existsSync(path.join(snapshot, "denied.txt")), false);
    const address = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
    assert.equal(await (await fetch(address)).text(), "network sentinel"); received = 0;
    const network = process.platform === "win32" ? ["pwsh.exe", "-NoLogo", "-NoProfile", "-Command", `Invoke-WebRequest -Uri '${address}' -TimeoutSec 2 -ErrorAction Stop | Out-Null`]
      : ["/usr/bin/curl", "--fail", "--max-time", "2", address];
    const child = spawn("codex", [...configuration, ...network], { windowsHide: true, stdio: "ignore" });
    const code = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
    assert.notEqual(code, 0); assert.equal(received, 0, "sandbox commands must not reach even a loopback listener");
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); rmSync(root, { recursive: true, force: true }); }
});
