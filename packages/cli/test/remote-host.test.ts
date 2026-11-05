import { spawn, type ChildProcess } from "node:child_process";
import { pathToFileURL } from "node:url";
import { once } from "node:events";
import fs from "node:fs";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { test } from "node:test";
import { RemoteHostRegistry, remoteHostOrigin } from "../../../apps/editor/server/remote-host-registry.ts";
import { processStart } from "../../../apps/editor/server/daemon-state.ts";
import { DAEMON_PROTOCOL } from "../../../apps/editor/server/daemon-protocol.ts";
import { runCliAsync } from "../src/cli.ts";

test("shared registry preserves identity, rejects invalid/duplicate origins and protects removal; CLI uses same store", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-host-registry-"));
  const previous = process.env.LITZIO_DATA_DIR;
  process.env.LITZIO_DATA_DIR = root;
  t.after(() => { if (previous === undefined) delete process.env.LITZIO_DATA_DIR; else process.env.LITZIO_DATA_DIR = previous; rmSync(root, { recursive: true, force: true }); });
  const registry = new RemoteHostRegistry();
  assert.deepEqual(registry.list(), []);
  const { host } = registry.register("https://EXAMPLE.com:443/", "Remote");
  assert.equal(host.origin, "https://example.com");
  assert.throws(() => registry.register("https://example.com", "Duplicate"), /already registered/);
  const original = readFileSync(registry.file, "utf8");
  for (const origin of ["https://x/path", "https://x/a/..", "https://u:p@x", "https://x?", "https://x#", "file:///tmp", "https://*.example.com", "https://x;script-src *", "https://x\\evil"]) assert.throws(() => remoteHostOrigin(origin));
  // Canonicalization must never turn accepted input into an unreadable registry or CSP wildcard.
  for (const origin of ["https://%2a.example.com", "https://%2A.example.com", "https://＊.example.com", "https://%EF%BC%8A.example.com", "https://x%3b.example.com"]) {
    assert.equal(await runCliAsync(["host", "register", origin, "Remote"]), 1, origin);
    assert.equal(readFileSync(registry.file, "utf8"), original);
    assert.deepEqual(registry.list(), [host]);
  }
  for (const origin of ["HTTPS://EXAMPLE.COM:443/", "https://%65xample.com", "https://ＥＸＡＭＰＬＥ.com"]) {
    assert.equal(remoteHostOrigin(origin), host.origin);
    assert.throws(() => registry.register(origin, "Duplicate"), /already registered/);
  }
  const idn = registry.register("https://BÜCHER.example:443/", "IDN").host;
  assert.equal(idn.origin, "https://xn--bcher-kva.example");
  for (const origin of ["https://xn--bcher-kva.example", "https://b%C3%BCcher.example"]) {
    assert.equal(remoteHostOrigin(origin), idn.origin);
    assert.throws(() => registry.register(origin, "Duplicate IDN"), /already registered/);
  }
  assert.deepEqual(registry.list(), [host, idn]);
  registry.remove(idn.hostId, () => ({ confirmed: true, workCleared: true, recoveryCleared: true }));
  assert.throws(() => registry.remove(host.hostId), /protection cannot be verified/);
  assert.equal(readFileSync(registry.file, "utf8"), original);
  assert.equal(await runCliAsync(["host", "rename", host.hostId, "New label"]), 0);
  assert.deepEqual(registry.get(host.hostId), { ...host, label: "New label" });
  assert.equal(await runCliAsync(["host", "remove", host.hostId]), 1);
  assert.equal(await runCliAsync(["host", "remove", host.hostId, "--confirm"]), 1);
  assert.equal(registry.list().length, 1);
  writeFileSync(registry.file + ".lock", JSON.stringify({ pid: process.pid, processStartedAt: processStart(process.pid) }));
  assert.throws(() => registry.rename(host.hostId, "Lost update"), /live owner/);
  rmSync(registry.file + ".lock");
  writeFileSync(registry.file + ".lock", JSON.stringify({ pid: process.pid, processStartedAt: "previous-process" }));
  const staleLock = readFileSync(registry.file + ".lock", "utf8"), beforeStale = readFileSync(registry.file, "utf8");
  for (const writer of [registry, new RemoteHostRegistry(registry.file)]) {
    assert.throws(() => writer.rename(host.hostId, "Lost update"), error => {
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes(registry.file + ".lock"));
      assert.match(error.message, /delete it after verification, then retry/);
      return true;
    });
  }
  assert.equal(readFileSync(registry.file + ".lock", "utf8"), staleLock);
  assert.equal(readFileSync(registry.file, "utf8"), beforeStale);
  rmSync(registry.file + ".lock"); // Explicit operator action, never automatic recovery.
  assert.throws(() => registry.remove(host.hostId, () => ({ confirmed: true, workCleared: true, recoveryCleared: false })), /Removal refused/);
  registry.remove(host.hostId, () => ({ confirmed: true, workCleared: true, recoveryCleared: true }));
  assert.deepEqual(registry.list(), []);
});

test("registered health probe checks protocol, warns product difference, never follows redirects or controls daemon", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-host-probe-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let protocol = DAEMON_PROTOCOL, status = 200;
  const server = createServer((req, res) => {
    assert.equal(req.method, "GET"); assert.equal(req.url, "/daemon/health");
    assert.equal(req.headers["x-litzio-protocol"], DAEMON_PROTOCOL);
    res.writeHead(status, { "Content-Type": "application/json", Location: "/unexpected" });
    res.end(JSON.stringify({ protocolVersion: protocol, productVersion: "different" }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const registry = new RemoteHostRegistry(path.join(root, "hosts.json"));
  const address = server.address() as { port: number };
  const { host } = registry.register(`http://127.0.0.1:${address.port}`, "Remote");
  const result = await registry.status(host.hostId, "client");
  assert.equal(result.outcome, "success"); assert.ok("warning" in result); assert.equal(result.windowObserved, false);
  protocol = "incompatible"; assert.equal((await registry.status(host.hostId, "client")).state, "protocol-mismatch");
  status = 409; assert.equal((await registry.status(host.hostId, "client")).outcome, "refused");
  status = 302; assert.equal((await registry.status(host.hostId, "client")).outcome, "failure");
  await assert.rejects(registry.status("unknown", "client"), /Unknown/);
});

test("removal checks every Desktop profile, including stopped/crashed owners and reused PIDs", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-host-owners-"));
  const previous = process.env.LITZIO_DATA_DIR;
  process.env.LITZIO_DATA_DIR = root;
  const children: { child: ChildProcess; exited: Promise<unknown> }[] = [];
  t.after(async () => {
    for (const { child, exited } of children) { if (child.exitCode === null && child.signalCode === null) child.kill(); await exited; }
    if (previous === undefined) delete process.env.LITZIO_DATA_DIR; else process.env.LITZIO_DATA_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  });
  const registry = new RemoteHostRegistry();
  const { host } = registry.register("https://remote.example", "Remote");
  const module = pathToFileURL(path.resolve(import.meta.dirname, "../../../apps/editor/server/remote-host-registry.ts")).href;
  const desktop = async (profile: string, summary: unknown, hold = false) => {
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e",
      `import {RemoteHostRegistry} from ${JSON.stringify(module)}; const registry = new RemoteHostRegistry(); registry.desktopWork(${JSON.stringify(path.join(root, profile))}, ${JSON.stringify(summary)}); process.send(registry.desktopWorkFile(${JSON.stringify(path.join(root, profile))})); ${hold ? "process.on('message', () => {});" : "process.disconnect();"}`],
      { env: process.env, stdio: ["ignore", "ignore", "pipe", "ipc"], windowsHide: true });
    let stderr = ""; child.stderr!.on("data", data => { stderr += data; });
    const exited = once(child, "exit");
    children.push({ child, exited });
    const [file] = await Promise.race([once(child, "message"), exited.then(() => { throw new Error(`Desktop failed before ready: ${stderr}`); })]);
    if (!hold) { const [code] = await exited; assert.equal(code, 0, stderr); }
    return { child, exited, file: file as string };
  };
  const a = await desktop("profile-a", [], true);
  await desktop("profile-b", []);
  assert.equal(await runCliAsync(["host", "remove", host.hostId]), 1, "stopped B must not hide running A");
  assert.throws(() => registry.desktopRemovalProof(host.hostId, path.join(root, "profile-b")), /profile is running/);
  a.child.kill(); await a.exited;
  assert.deepEqual(registry.cliRemovalProof(host.hostId), { confirmed: true, workCleared: true, recoveryCleared: true });
  let workFile = "";
  for (const summary of [null, [{ hostId: host.hostId, openWork: 1, recovery: 0 }], [{ hostId: host.hostId, openWork: 0, recovery: 1 }]]) {
    workFile = (await desktop("profile-a", summary)).file;
    assert.equal(await runCliAsync(["host", "remove", host.hostId]), 1, "stopped A work must not be hidden by clear B");
  }
  const saved = readFileSync(workFile, "utf8");
  assert.equal(readdirSync(registry.file + ".work").filter(name => name.endsWith(".json")).length, 2, "profile updates must preserve the other owner");
  writeFileSync(workFile, "{");
  assert.equal(await runCliAsync(["host", "remove", host.hostId]), 1, "damaged summaries refuse");
  const malformed = JSON.parse(saved);
  delete malformed.processStartedAt;
  writeFileSync(workFile, JSON.stringify(malformed));
  assert.equal(await runCliAsync(["host", "remove", host.hostId]), 1, "a damaged owner entry refuses even if another entry is valid");
  writeFileSync(workFile, saved);
  const originalRead = fs.readFileSync;
  const unreadable = t.mock.method(fs, "readFileSync", (...args: Parameters<typeof fs.readFileSync>) => {
    if (args[0] === workFile) throw Object.assign(new Error("denied"), { code: "EACCES" });
    return originalRead(...args);
  });
  try { assert.equal(await runCliAsync(["host", "remove", host.hostId]), 1, "unreadable summaries refuse"); }
  finally { unreadable.mock.restore(); }
  const withRecovery = JSON.parse(saved);
  withRecovery.pid = process.pid; withRecovery.processStartedAt = "previous-process-creation-time";
  const reusedFile = path.join(path.dirname(workFile), `${path.basename(workFile).split(".")[0]}.${process.pid}.${withRecovery.processStartedAt}.json`);
  fs.renameSync(workFile, reusedFile); workFile = reusedFile;
  writeFileSync(workFile, JSON.stringify(withRecovery));
  assert.equal(await runCliAsync(["host", "remove", host.hostId]), 1, "PID reuse must retain old recovery protection");
  withRecovery.summary = [{ hostId: "another-host", openWork: 3, recovery: 2 }];
  writeFileSync(workFile, JSON.stringify(withRecovery));
  assert.equal(await runCliAsync(["host", "remove", host.hostId]), 0, "stale clear owners permit removal even if a PID was reused");
  assert.deepEqual(registry.list(), []);
});

test("a locked previous summary and EPERM updating this run cannot bypass CLI removal protection", t => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-host-locked-owner-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const registry = new RemoteHostRegistry(path.join(root, "hosts.json"));
  const host = registry.register("https://remote.example", "Remote").host;
  const file = registry.desktopWorkFile(path.join(root, "profile"));
  const oldFile = path.join(path.dirname(file), `${path.basename(file).split(".")[0]}.2147483647.previous.json`);
  fs.mkdirSync(path.dirname(file));
  const oldBytes = JSON.stringify({ pid: 2147483647, processStartedAt: "previous", summary: [] });
  writeFileSync(oldFile, oldBytes);
  const rename = fs.renameSync, unlink = fs.unlinkSync;
  const locked = () => Object.assign(new Error("Windows sharing violation"), { code: "EPERM" });
  const renameMock = t.mock.method(fs, "renameSync", (from: fs.PathLike, to: fs.PathLike) => {
    if (to === oldFile || to === file) throw locked();
    return rename(from, to);
  });
  const unlinkMock = t.mock.method(fs, "unlinkSync", (target: fs.PathLike) => {
    if (target === oldFile) throw locked();
    return unlink(target);
  });
  try {
    registry.desktopWork(path.join(root, "profile"), null);
    assert.equal(readFileSync(oldFile, "utf8"), oldBytes, "locked previous entry is untouched");
    assert.throws(() => registry.desktopWork(path.join(root, "profile"), []), /sharing violation/);
    assert.equal(JSON.parse(readFileSync(file, "utf8")).pid, process.pid);
    assert.throws(() => registry.cliRemovalProof(host.hostId), /profile is running/);
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), summary: [] }));
    assert.throws(() => registry.cliRemovalProof(host.hostId), /profile is running/, "even a clear live summary refuses CLI removal");
    assert.deepEqual(registry.list(), [host]);
  } finally { renameMock.mock.restore(); unlinkMock.mock.restore(); }
});


test("plugin authoring CLI forwards Host directory/id and preserves validation failure", async t => {
  const bodies: unknown[] = [];
  t.mock.method(globalThis, "fetch", async (url: URL, init?: RequestInit) => {
    if (url.pathname === "/daemon/health") return new Response(JSON.stringify({ protocolVersion: DAEMON_PROTOCOL }));
    bodies.push(JSON.parse(init!.body as string));
    return new Response(JSON.stringify({ valid: false, errors: ["Missing handler: greet"], receipt: { outcome: "failure" } }));
  });
  assert.equal(await runCliAsync(["plugins", "scaffold", "C:/host/greeting", "--id", "local.greeting", "--host", "http://127.0.0.1:5180", "--json"]), 1);
  assert.equal(await runCliAsync(["plugins", "validate", "C:/host/greeting", "--host", "http://127.0.0.1:5180", "--json"]), 1);
  assert.deepEqual(bodies, [{ action: "scaffold", directory: "C:/host/greeting", id: "local.greeting" }, { action: "validate", directory: "C:/host/greeting" }]);
});
