import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, openSync } from "node:fs";
import path from "node:path";
import { daemonDirectory, daemonPort, reclaimStaleDaemon, inspectDaemon, readDaemonRecord, prepareDaemonDirectory, daemonRpc, type DaemonChannel, type DaemonRecord } from "../../editor/server/daemon-state.ts";
import { sameInstance, type DaemonHealth } from "../../editor/server/daemon-protocol.ts";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** The same local CLI run/lock path. A private IPC pipe owns only the instance this Desktop spawned. */
export class DesktopDaemon {
  record!: DaemonRecord;
  health!: DaemonHealth;
  private owned?: DaemonRecord;
  private child?: ChildProcess;
  private connecting?: Promise<void>;
  readonly channel: DaemonChannel;
  constructor(readonly version: string, private bin: string, private entry: string) {
    this.channel = version === "development" ? "development" : version.includes("-") ? "beta" : "stable";
  }
  connect(): Promise<void> {
    return this.connecting ??= this.findOrStart().finally(() => { this.connecting = undefined; });
  }
  private async findOrStart(): Promise<void> {
    const directory = daemonDirectory(this.channel);
    reclaimStaleDaemon(directory);
    let record = readDaemonRecord(directory);
    if (!record) {
      prepareDaemonDirectory(directory);
      const log = path.join(directory, "daemon.log"), fd = openSync(log, "a", 0o600);
      let identity: DaemonRecord | undefined;
      try {
        const child = spawn(this.bin, [this.entry, "daemon", "run", "--channel", this.channel], {
          detached: true, windowsHide: true, stdio: ["ignore", fd, fd, "ipc"],
          env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", LITZIO_DESKTOP_DAEMON: "1" },
        });
        this.child = child;
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => { if (child.connected) child.disconnect(); reject(new Error(`Daemon startup was not confirmed. Inspect ${log}`)); }, 15_000);
          const done = () => { clearTimeout(timer); resolve(); };
          child.once("error", error => { clearTimeout(timer); reject(error); });
          child.once("message", (message: any) => { if (message?.ready === true) identity = message.identity; done(); });
          child.once("exit", done); // A concurrent candidate can own the lock instead.
        });
      } finally { closeSync(fd); }
      for (let i = 0; i < 100; i++) {
        record = readDaemonRecord(directory);
        if (record) break;
        if (!existsSync(path.join(directory, "daemon.lock"))) throw new Error(`Daemon startup failed. Inspect ${log}`);
        await delay(100);
      }
      if (record && identity && sameInstance(record, identity)) this.owned = record;
    }
    if (!record || record.url !== `http://127.0.0.1:${daemonPort(this.channel)}`) throw new Error("Expected the fixed local daemon origin. Remote and manual daemons are not Desktop targets.");
    this.health = await inspectDaemon(record, this.version, () => {});
    this.record = record;
  }
  async stopExplicitly(): Promise<void> {
    const record = this.record;
    await daemonRpc(record, "/daemon/stop", { ...record, confirm: true });
    for (let i = 0; i < 100; i++) {
      const current = readDaemonRecord(daemonDirectory(this.channel));
      if (!current || !sameInstance(current, record)) return;
      await delay(100);
    }
    throw new Error("Daemon shutdown was not confirmed; inspect its log.");
  }
  async check(): Promise<void> { await inspectDaemon(this.record, this.version, () => {}); }
  async close(): Promise<void> {
    const owned = this.owned;
    if (!owned) return;
    this.owned = undefined;
    // Closing the IPC pipe also handles crashes; never stop a CLI-owned or replaced instance.
    if (this.child?.connected) this.child.disconnect();
    for (let i = 0; i < 100; i++) {
      const current = readDaemonRecord(daemonDirectory(this.channel));
      if (!current || !sameInstance(current, owned)) return;
      await delay(100);
    }
    throw new Error("Desktop daemon shutdown was not confirmed; inspect its log.");
  }
}
