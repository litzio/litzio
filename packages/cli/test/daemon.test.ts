import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { createServer } from "node:net";
import { acquireDaemonLock, daemonPort, readDaemonRecord, type DaemonRecord } from "../../../apps/editor/server/daemon-state.ts";

test("daemon CLI concurrent start publishes one authenticated instance, stop verifies it, occupied port fails", async t => {
  const userA = "sid:S-1-5-21-111-222-333-1001", userB = "sid:S-1-5-21-111-222-333-1002";
  const channels = ["stable", "beta", "development"] as const;
  const userPorts = [userA, userB].flatMap(user => channels.map(channel => daemonPort(channel, user)));
  assert.equal(new Set(userPorts).size, userPorts.length, "different Windows users/channels must not all use machine-wide channel ports");
  for (const channel of channels) {
    assert.ok(daemonPort(channel, userA) >= 20000 && daemonPort(channel, userA) <= 44575);
  }
  const started = Date.now(), base = fs.mkdtempSync(path.join(os.tmpdir(), "litzio-daemon-"));
  const entry = path.join(base, "cli.mjs"), state = path.join(base, "state");
  const env = { ...process.env, LITZIO_DAEMON_DIR: state, LITZIO_PLUGINS_DIR: path.join(base, "plugins"),
    LITZIO_AI_AGENT_CWD: path.join(base, "assistant"), LITZIO_AI_AGENT_SETTINGS_FILE: path.join(base, "ai.json"), LITZIO_DOCLING_SETTINGS_FILE: path.join(base, "docling.json") };
  // Real CLI dispatch + detached subprocess/IPC + TCP cannot be proved by in-process lock tests.
  // Use a tiny static Editor fixture; production Save/Reload remains in the existing browser test.
  fs.mkdirSync(path.join(base, "editor")); fs.writeFileSync(path.join(base, "editor/index.html"), "<!doctype html><title>Fixture</title>");
  await build({ entryPoints: [fileURLToPath(new URL("../src/cli.ts", import.meta.url))], outfile: entry, bundle: true, platform: "node", format: "esm", logLevel: "silent",
    define: { __LITZIO_CLI_BUILD__: JSON.stringify({ version: "test-version", desktop: false, commit: "test" }) },
    banner: { js: 'import {createRequire as __testCreateRequire} from "node:module"; const require=__testCreateRequire(import.meta.url);' } });
  const execute = (args: string[]) => new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [entry, "daemon", ...args, "--channel", "development"], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    // A refusal regression must fail rather than leave a foreground listener/test hanging.
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 15_000);
    let stdout = "", stderr = "";
    child.stdout.on("data", data => { stdout += data; }); child.stderr.on("data", data => { stderr += data; });
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("close", code => { clearTimeout(timer); if (timedOut) reject(new Error(`CLI did not exit: ${args.join(" ")}`)); else resolve({ code, stdout, stderr }); });
  });
  const directory = path.join(state, "development");
  let stopped = false;
  let owned: DaemonRecord | undefined;
  try {
    const results = await Promise.all([execute(["start"]), execute(["start"])]);
    for (const result of results) assert.equal(result.code, 0, result.stderr);
    const first = JSON.parse(results[0].stdout), second = JSON.parse(results[1].stdout);
    assert.equal(first.instanceId, second.instanceId); assert.equal(first.pid, second.pid);
    assert.equal(first.url, `http://127.0.0.1:${daemonPort("development")}`);
    assert.equal((await fetch(first.url + "/api/document")).status, 401);
    const status = await execute(["status"]); assert.equal(status.code, 0, status.stderr);
    assert.equal(JSON.parse(status.stdout).instanceId, first.instanceId);
    assert.equal((await execute(["stop"])).code, 1);
    const record = readDaemonRecord(directory)!;
    owned = record;
    fs.writeFileSync(path.join(directory, "instance.json"), JSON.stringify({ ...record, startedAt: new Date(0).toISOString() }));
    const refused = await execute(["stop", "--confirm"]);
    assert.equal(refused.code, 1); assert.match(refused.stderr, /identity changed/);
    fs.writeFileSync(path.join(directory, "instance.json"), JSON.stringify(record));
    const stop = await execute(["stop", "--confirm"]); assert.equal(stop.code, 0, stop.stderr); stopped = true;
    assert.equal(fs.existsSync(path.join(directory, "daemon.lock")), false);
    assert.equal(fs.existsSync(path.join(directory, "instance.json")), false);
    await assert.rejects(fetch(first.url), /fetch failed/);
    const blocker = createServer();
    await new Promise<void>((resolve, reject) => { blocker.once("error", reject); blocker.listen(daemonPort("development"), "127.0.0.1", resolve); });
    try {
      const conflict = await execute(["start"]);
      assert.equal(conflict.code, 1);
      assert.match(fs.readFileSync(path.join(directory, "daemon.log"), "utf8"), /EADDRINUSE/);
      assert.equal(readDaemonRecord(directory), undefined);
    } finally { await new Promise<void>(resolve => blocker.close(() => resolve())); }
    const restricted = await execute(["run", "--host", "0.0.0.0", "--public-origin", "https://docs.example"]);
    assert.equal(restricted.code, 1); assert.match(restricted.stderr, /Unrestricted access requires/);
    const publicUnrestricted = await execute(["run", "--public-origin", "https://docs.example"]);
    assert.equal(publicUnrestricted.code, 1); assert.match(publicUnrestricted.stderr, /Unrestricted access does not allow --public-origin/);
  } finally {
    owned ??= readDaemonRecord(directory);
    if (!stopped && owned) {
      fs.writeFileSync(path.join(directory, "instance.json"), JSON.stringify(owned));
      const cleanup = await execute(["stop", "--confirm"]);
      assert.equal(cleanup.code, 0, `Owned daemon cleanup failed; inspect ${base}: ${cleanup.stderr}`);
    }
    fs.rmSync(base, { recursive: true, force: true });
    t.diagnostic(`CLI lifecycle subprocess integration: ${Date.now() - started} ms (includes bundle, concurrent start/status/stop and port conflict).`);
  }
});

test("exclusive lock never reclaims a PID or releases another generation", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "litzio-lock-")), file = path.join(base, "daemon.lock");
  const identity = { pid: process.pid, startedAt: new Date().toISOString(), instanceId: "first" };
  try {
    const release = acquireDaemonLock(file, identity);
    assert.throws(() => acquireDaemonLock(file, { ...identity, instanceId: "contender" }), /lock exists/);
    fs.writeFileSync(file, JSON.stringify({ ...identity, instanceId: "replacement" }));
    assert.throws(release, /ownership changed/);
    assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).instanceId, "replacement");
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});
