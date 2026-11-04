// Lifecycle CI only: real installed/packaged binaries, isolated discovery and Host data.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { daemonDirectory, daemonRpc, inspectDaemon, processStart, readDaemonRecord, type DaemonChannel, type DaemonRecord } from "../../../editor/server/daemon-state.ts";

export function desktopRecord(channel: DaemonChannel, version: string): DaemonRecord {
  const record = readDaemonRecord(daemonDirectory(channel));
  assert.ok(record, "Desktop published discovery");
  assert.equal(record.launcher, "desktop");
  assert.equal(record.productVersion, version);
  return record;
}

export function assertExited(record: DaemonRecord): void {
  assert.notEqual(processStart(record.pid), record.processStartedAt, "old daemon process exited");
}

export function assertNoDiscovery(channel: DaemonChannel): void {
  for (const file of ["instance.json", "daemon.lock"]) assert.equal(existsSync(path.join(daemonDirectory(channel), file)), false, `removed ${channel}/${file}`);
}

export async function cliDaemon(executable: string, channel: DaemonChannel) {
  const started = Date.now();
  const child = spawn(executable, [path.join(path.dirname(executable), "resources/cli/cli.mjs"), "daemon", "run", "--channel", channel], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", LITZIO_DESKTOP_DAEMON: "", LITZIO_DAEMON_START: "" },
    windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let output = "";
  child.stdout!.on("data", bytes => { output += bytes; });
  child.stderr!.on("data", bytes => { output += bytes; });
  const exited = new Promise<void>((resolve, reject) => { child.once("error", reject); child.once("exit", () => resolve()); });
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`CLI daemon startup: ${output}`)), 15_000);
    child.once("message", () => { clearTimeout(timer); resolve(); });
    child.once("exit", () => { clearTimeout(timer); reject(new Error(`CLI daemon exited before ready: ${output}`)); });
    child.once("error", error => { clearTimeout(timer); reject(error); });
  });
  try { await ready; }
  catch (error) { child.kill(); await exited; throw error; }
  const record = readDaemonRecord(daemonDirectory(channel))!;
  assert.ok(record); assert.equal(record.pid, child.pid); assert.equal(record.launcher, "cli-run");
  return { record,
    async alive() { await inspectDaemon(record, record.productVersion, () => {}); },
    async stop() {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await daemonRpc(record, "/daemon/stop", { ...record, confirm: true });
        await Promise.race([exited, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("CLI fixture did not exit")), 10_000); })]);
        assertExited(record); assertNoDiscovery(channel);
      } catch (error) {
        // Preserve the graceful-shutdown failure, but never leave this owned ChildProcess
        // keeping node:test alive and hiding that failure until the job is cancelled.
        if (child.exitCode === null && child.signalCode === null) { child.kill(); await exited; }
        throw error;
      }
      finally { clearTimeout(timer); }
      console.log(`isolated ${channel} CLI daemon lifetime ${Date.now() - started} ms`);
    },
  };
}
