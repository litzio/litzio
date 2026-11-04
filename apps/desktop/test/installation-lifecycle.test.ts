import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, symlinkSync, unlinkSync, rmdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkInstallation, prepareInstallation, installationPort, type InstallationPort, type InstalledProcess } from "../src/installation-lifecycle.ts";
import type { DaemonRecord } from "../../editor/server/daemon-state.ts";

const record = { pid: 42, processStartedAt: "creation", launcher: "desktop", daemonHome: "isolated/beta" } as DaemonRecord;
const daemon: InstalledProcess = { pid: 42, started: "creation", command: '"app.exe" "cli.mjs" daemon run', window: false };
function fixture(records = [record]) {
  let processes = [daemon];
  const closed: number[][] = [];
  const port: InstallationPort = { records: () => records, processes: () => processes,
    closeWindows: owners => { closed.push(owners.map(p => p.pid)); processes = []; }, recordsRemoved: () => true };
  return { port, closed, setProcesses: (value: InstalledProcess[]) => { processes = value; } };
}

test("installation refuses both CLI launchers and unregistered manual daemons without closing Desktop", async () => {
  for (const launcher of ["cli-start", "cli-run"] as const) {
    const h = fixture([{ ...record, launcher }]);
    await assert.rejects(prepareInstallation(h.port), /CLI daemon.*PID 42.*matching CLI/);
    assert.deepEqual(h.closed, []);
  }
  assert.throws(() => checkInstallation(fixture([]).port), /CLI daemon.*PID 42/);
});

test("installation closes windows and requires processes AND daemon records to be gone", async () => {
  const h = fixture();
  h.setProcesses([daemon, { pid: 9, started: "desktop", window: true, command: "app.exe" }]);
  await prepareInstallation(h.port);
  assert.deepEqual(h.closed, [[9]]);
  const stale = fixture();
  stale.port.recordsRemoved = () => false;
  await assert.rejects(prepareInstallation(stale.port), /discovery\/lock cleanup was not confirmed/);
});

test("a reused PID never proves Desktop ownership of a CLI process", () => {
  const h = fixture();
  h.setProcesses([{ ...daemon, started: "new creation" }]);
  assert.throws(() => checkInstallation(h.port), /CLI daemon/);
});

test("mandatory Windows process query survives damaged optional-cleanup environment without repairing it", { skip: process.platform !== "win32" }, () => {
  const saved = process.env.SystemRoot;
  const damaged = "C:\\missing-windows-1164";
  process.env.SystemRoot = damaged;
  try {
    // Read-only OS query, no record reads, window closes, user data or registry writes.
    assert.equal(installationPort(process.execPath).processes().some(p => p.pid === process.pid), false);
    assert.equal(process.env.SystemRoot, damaged, "optional cleanup must still see its own failure");
  } finally {
    if (saved === undefined) delete process.env.SystemRoot; else process.env.SystemRoot = saved;
  }
});

test("Windows identifies the same executable launched through the CLI junction", { skip: process.platform !== "win32" }, async () => {
  // CIM and process.execPath preserve the junction spelling. A port-only test cannot
  // establish this OS behavior; use one owned Node child, never a packaged installation.
  const base = mkdtempSync(path.join(os.tmpdir(), "litzio-1164-alias-"));
  const link = path.join(base, "app");
  symlinkSync(path.dirname(process.execPath), link, "junction");
  const child = spawn(path.join(link, path.basename(process.execPath)), ["-e", "process.send({ready:true});setInterval(()=>{},1000)"], {
    windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  const exited = once(child, "exit");
  const timer = setTimeout(() => child.kill(), 15_000);
  try {
    await Promise.race([once(child, "message"), exited.then(() => { throw new Error("Alias probe exited before ready"); })]);
    const port = installationPort(process.execPath);
    const owner = port.processes().find(p => p.pid === child.pid);
    assert.ok(owner, "canonical executable query includes the junction alias");
    assert.throws(() => checkInstallation({ ...port, records: () => [{ ...record, pid: owner.pid, processStartedAt: owner.started, launcher: "cli-run" }] }), /CLI daemon/);
    unlinkSync(link); // CLI Turn off can remove its junction while the daemon is still alive.
    assert.throws(() => port.processes(), { code: "ENOENT" }, "an unresolved live image must block installation, not disappear from its process list");
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
    if (existsSync(link)) unlinkSync(link);
    rmdirSync(base);
  }
});
