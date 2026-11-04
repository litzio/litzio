import { DAEMON_PROTOCOL } from "../../../apps/editor/server/daemon-protocol.ts";
import { DesktopDaemon } from "../../../apps/desktop/src/daemon-client.ts";
import { once } from "node:events";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { createServer } from "node:net";
import { acquireDaemonLock, processStart, reclaimStaleDaemon, daemonPort, readDaemonRecord, stopDaemon, type DaemonRecord } from "../../../apps/editor/server/daemon-state.ts";

test("daemon CLI keeps one local instance, rejects occupied ports and warns for unrestricted remote mode", async t => {
  const userA = "sid:S-1-5-21-111-222-333-1001", userB = "sid:S-1-5-21-111-222-333-1002";
  const channels = ["stable", "beta", "development"] as const;
  const userPorts = [userA, userB].flatMap(user => channels.map(channel => daemonPort(channel, user)));
  assert.equal(new Set(userPorts).size, userPorts.length, "different Windows users/channels must not all use machine-wide channel ports");
  for (const channel of channels) {
    assert.ok(daemonPort(channel, userA) >= 20000 && daemonPort(channel, userA) <= 44575);
  }
  const started = Date.now(), base = fs.mkdtempSync(path.join(os.tmpdir(), "litzio-daemon-"));
  const entry = path.join(base, "cli.mjs"), state = path.join(base, "state");
  const env = { ...process.env, LITZIO_DATA_DIR: path.join(base, "data"), LITZIO_DAEMON_DIR: state,
    LITZIO_AI_AGENT_CWD: path.join(base, "assistant"), LITZIO_AI_AGENT_SETTINGS_FILE: path.join(base, "ai.json") };
  // Real CLI dispatch + detached subprocess/IPC + TCP cannot be proved by in-process lock tests.
  // Use a tiny static Editor fixture; production Save/Reload remains in the existing browser test.
  fs.mkdirSync(path.join(base, "editor")); fs.writeFileSync(path.join(base, "editor/index.html"), "<!doctype html><title>Fixture</title>");
  await build({ entryPoints: [fileURLToPath(new URL("../src/cli.ts", import.meta.url))], outfile: entry, bundle: true, platform: "node", format: "esm", logLevel: "silent",
    define: { __LITZIO_CLI_BUILD__: JSON.stringify({ version: "test-version", desktop: false, commit: "test" }) },
    banner: { js: 'import {createRequire as __testCreateRequire} from "node:module"; const require=__testCreateRequire(import.meta.url);' } });
  const execute = (args: string[], inspect?: () => Promise<void>) => new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [entry, "daemon", ...args, "--channel", "development"], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    // A startup/inspection regression must fail rather than leave a foreground listener/test hanging.
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 15_000);
    let stdout = "", stderr = "", inspection: Promise<void> | undefined, inspectionError: unknown;
    child.stdout.on("data", data => {
      stdout += data;
      if (inspect && !inspection && stdout.includes("Litzio HTTP:")) inspection = inspect().catch(error => { inspectionError = error; child.kill(); });
    });
    child.stderr.on("data", data => { stderr += data; });
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("close", async code => {
      clearTimeout(timer); await inspection;
      if (inspectionError) reject(inspectionError);
      else if (timedOut) reject(new Error(`CLI did not exit: ${args.join(" ")}`));
      else resolve({ code, stdout, stderr });
    });
  });
  const previousState = process.env.LITZIO_DAEMON_DIR;
  process.env.LITZIO_DAEMON_DIR = state;
  const directory = path.join(state, "development");
  let stopped = false;
  let owned: DaemonRecord | undefined;
  try {
    const results = await Promise.all([execute(["start"]), execute(["start"])]);
    for (const result of results) assert.equal(result.code, 0, result.stderr);
    const first = JSON.parse(results[0].stdout), second = JSON.parse(results[1].stdout);
    assert.equal(first.instanceId, second.instanceId); assert.equal(first.pid, second.pid);
    assert.equal(first.url, `http://127.0.0.1:${daemonPort("development")}`);
    assert.equal((await fetch(first.url + "/api/document")).status, 200);
    const status = await execute(["status", "--json"]); assert.equal(status.code, 0, status.stderr);
    assert.equal(JSON.parse(status.stdout).instanceId, first.instanceId);
    assert.equal(JSON.parse(status.stdout).launcher, "cli-start");
    assert.match((await execute(["status"])).stdout, /Launcher\s+cli-start/);
    assert.equal((await execute(["stop"])).code, 1);
    const record = readDaemonRecord(directory)!;
    owned = record;
    fs.writeFileSync(path.join(directory, "instance.json"), JSON.stringify({ ...record, startedAt: new Date(0).toISOString() }));
    const refused = await execute(["stop", "--confirm"]);
    assert.equal(refused.code, 1); assert.match(refused.stderr, /identity changed/);
    fs.writeFileSync(path.join(directory, "instance.json"), JSON.stringify(record));
    const attached = new DesktopDaemon("development", process.execPath, entry);
    await attached.connect();
    assert.equal(attached.health.launcher, "cli-start");
    await attached.close();
    assert.equal((await execute(["status", "--json"])).code, 0, "Desktop close preserves a CLI daemon");
    await attached.stopExplicitly();
    for (let i = 0; i < 100 && fs.existsSync(path.join(directory, "daemon.lock")); i++) await new Promise(resolve => setTimeout(resolve, 100));
    stopped = true;
    assert.equal(fs.existsSync(path.join(directory, "daemon.lock")), false);
    assert.equal(fs.existsSync(path.join(directory, "instance.json")), false);
    await assert.rejects(fetch(first.url), /fetch failed/);
    const desktop = new DesktopDaemon("development", process.execPath, entry);
    // New Desktop child inherits only this test's isolated stores.
    const savedEnv = Object.fromEntries(Object.keys(env).filter(key => key.startsWith("LITZIO_")).map(key => [key, process.env[key]]));
    Object.assign(process.env, env);
    try {
      await desktop.connect();
      assert.equal(desktop.health.launcher, "desktop");
      assert.equal(readDaemonRecord(directory)!.instanceId, desktop.record.instanceId);
      await desktop.close();
      assert.equal(readDaemonRecord(directory), undefined, "normal Desktop close ends its own daemon");
      const parentScript = path.join(base, "desktop-parent.mts");
      fs.writeFileSync(parentScript, `import { DesktopDaemon } from ${JSON.stringify(new URL("../../../apps/desktop/src/daemon-client.ts", import.meta.url).href)}; const daemon = new DesktopDaemon("development", process.execPath, ${JSON.stringify(entry)}); await daemon.connect(); process.send?.(daemon.record); setInterval(()=>{}, 1000);`);
      const parent = spawn(process.execPath, ["--import", "tsx", parentScript], { cwd: fileURLToPath(new URL("../../../", import.meta.url)), env, windowsHide: true, stdio: ["ignore", "ignore", "inherit", "ipc"] });
      try {
        const [record] = await Promise.race([once(parent, "message"), once(parent, "exit").then(([code]) => { throw new Error(`Desktop parent exited before ready: ${code}`); })]);
        assert.equal(record.launcher, "desktop");
        parent.kill(); await once(parent, "exit");
        for (let i = 0; i < 100 && readDaemonRecord(directory); i++) await new Promise(resolve => setTimeout(resolve, 100));
        assert.equal(readDaemonRecord(directory), undefined, "crashed Desktop closes its pipe and leaves no daemon orphan");
      } finally { if (parent.exitCode === null && !parent.killed) parent.kill(); }
    } finally {
      for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
    // A forcibly killed CLI daemon leaves records. Explicit start reclaims that dead generation.
    const stale = await execute(["start"]); assert.equal(stale.code, 0, stale.stderr);
    const killed = readDaemonRecord(directory)!;
    process.kill(killed.pid, "SIGKILL");
    for (let i = 0; i < 100; i++) { try { process.kill(killed.pid, 0); await new Promise(resolve => setTimeout(resolve, 100)); } catch { break; } }
    const staleStatus = await execute(["status", "--json"]); assert.equal(staleStatus.code, 1); assert.equal(JSON.parse(staleStatus.stdout).state, "unreachable");
    const recovered = await execute(["start"]); assert.equal(recovered.code, 0, recovered.stderr);
    assert.notEqual(JSON.parse(recovered.stdout).instanceId, killed.instanceId);
    const repeated = await execute(["start"]); assert.match(repeated.stderr, /Already running.*cli-start/);
    assert.equal((await execute(["stop", "--confirm"])).code, 0);
    const blocker = createServer();
    await new Promise<void>((resolve, reject) => { blocker.once("error", reject); blocker.listen(daemonPort("development"), "127.0.0.1", resolve); });
    try {
      const conflict = await execute(["start"]);
      assert.equal(conflict.code, 1);
      assert.match(fs.readFileSync(path.join(directory, "daemon.log"), "utf8"), /EADDRINUSE/);
      assert.equal(readDaemonRecord(directory), undefined);
    } finally { await new Promise<void>(resolve => blocker.close(() => resolve())); }
    const remote = await execute(["run", "--host", "0.0.0.0", "--public-origin", first.url], async () => {
      assert.equal(readDaemonRecord(directory), undefined, "remote unrestricted daemon is not a Desktop discovery candidate");
      const headers = { "X-Litzio-Protocol": DAEMON_PROTOCOL, Origin: first.url };
      const folder = first.url + "/api/folder?" + new URLSearchParams({ root: base });
      assert.equal((await fetch(folder)).status, 200);
      assert.equal((await fetch(folder, { headers: { Origin: "https://foreign.invalid" } })).status, 403);
      assert.equal((await fetch(folder, { headers: { "Sec-Fetch-Site": "cross-site" } })).status, 403);
      const health = await (await fetch(first.url + "/daemon/health", { headers })).json();
      await stopDaemon({ ...health, url: first.url }, "test-version");
    });
    assert.equal(remote.code, 0, remote.stderr);
    assert.match(remote.stderr, /WARNING: this daemon has no authentication/);
    assert.match(remote.stderr, /Anyone on the same network.*reach this port/);
    assert.match(remote.stderr, /Without --root.*entire disk.*assistant \(AI\) execution/);
  } finally {
    owned = readDaemonRecord(directory);
    if (owned) {
      fs.writeFileSync(path.join(directory, "instance.json"), JSON.stringify(owned));
      const cleanup = await execute(["stop", "--confirm"]);
      assert.equal(cleanup.code, 0, `Owned daemon cleanup failed; inspect ${base}: ${cleanup.stderr}`);
    }
    if (previousState === undefined) delete process.env.LITZIO_DAEMON_DIR; else process.env.LITZIO_DAEMON_DIR = previousState;
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
    fs.writeFileSync(file, JSON.stringify({ ...identity, processStartedAt: processStart(process.pid) }));
    assert.equal(reclaimStaleDaemon(path.dirname(file)), false, "a live unresponsive owner is never reclaimed");
    fs.writeFileSync(file, JSON.stringify({ ...identity, processStartedAt: "different OS creation identity" }));
    assert.equal(reclaimStaleDaemon(path.dirname(file)), true, "PID reuse proves only the recorded generation is gone");
    fs.writeFileSync(file, JSON.stringify({ ...identity, instanceId: "replacement" }));
    assert.throws(release, /ownership changed/);
    assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).instanceId, "replacement");
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});
