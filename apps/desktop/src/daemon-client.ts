import { type ChildProcess } from "node:child_process";
import { daemonChannel, startDaemonChild, daemonDirectory, daemonPort, reclaimStaleDaemon, inspectDaemon, readDaemonRecord, daemonRpc, type DaemonChannel, type DaemonRecord } from "../../editor/server/daemon-state.ts";
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
    this.channel = daemonChannel(version);
  }
  connect(): Promise<void> {
    return this.connecting ??= this.findOrStart().finally(() => { this.connecting = undefined; });
  }
  private async findOrStart(): Promise<void> {
    const directory = daemonDirectory(this.channel);
    reclaimStaleDaemon(directory);
    let record = readDaemonRecord(directory);
    if (!record) {
      const result = await startDaemonChild({ directory, bin: this.bin,
        args: [this.entry, "daemon", "run", "--channel", this.channel], launcher: "desktop",
        onChild: child => { this.child = child; } });
      record = result.record;
      const identity = result.identity;
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
    // A window can close while startup is still publishing its ready identity.
    await this.connecting?.catch(() => {});
    const owned = this.owned;
    if (!owned) return;
    // Closing the IPC pipe also handles crashes; never stop a CLI-owned or replaced instance.
    if (this.child?.connected) this.child.disconnect();
    for (let i = 0; i < 100; i++) {
      const current = readDaemonRecord(daemonDirectory(this.channel));
      // Record removal precedes process exit: the executable can still be locked then.
      if ((!current || !sameInstance(current, owned)) &&
          (this.child?.exitCode !== null || this.child?.signalCode != null)) {
        this.owned = undefined;
        return;
      }
      await delay(100);
    }
    throw new Error("Desktop daemon shutdown was not confirmed; inspect its log.");
  }
}
