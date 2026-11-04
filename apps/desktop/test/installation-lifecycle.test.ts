import assert from "node:assert/strict";
import { test } from "node:test";
import { checkInstallation, prepareInstallation, type InstallationPort, type InstalledProcess } from "../src/installation-lifecycle.ts";
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
