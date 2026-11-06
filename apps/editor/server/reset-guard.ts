import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { brand } from "../../../brand.ts";
import { processStart } from "./daemon-state.ts";

/** All channels/installations share this account-wide gate, independently of Host data overrides. */
export const resetGuardDirectory = () => process.env.LITZIO_RESET_DIR ?? path.join(os.homedir(), `${brand.folders.shared}-reset-guard`);
type Owner = { pid: number; started: string; role: string };
let ownStart: string | undefined;

/** A narrow process-lifetime gate: never kills another owner or treats HTTP silence as death. */
export class ResetGuard {
  constructor(readonly directory = resetGuardDirectory(), private identify = processStart) {}
  private owner(role: string): Owner {
    const started = this.identify === processStart ? ownStart ??= this.identify(process.pid) : this.identify(process.pid);
    if (!started) throw new Error("Cannot identify the reset guard owner.");
    return { pid: process.pid, started, role };
  }
  private read(file: string): Owner {
    let owner;
    try { owner = JSON.parse(fs.readFileSync(file, "utf8")); }
    catch { throw new Error("Invalid reset guard owner; inspect the guard directory."); }
    if (!Number.isSafeInteger(owner.pid) || owner.pid < 1 || typeof owner.started !== "string" || !owner.started || !["desktop", "host", "cli", "reset", "host-shutdown-failed"].includes(owner.role)) throw new Error("Invalid reset guard owner; inspect the guard directory.");
    return owner;
  }
  private publish(file: string, owner: Owner) {
    fs.mkdirSync(this.directory, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(owner), { flag: "wx", mode: 0o600 });
    let released = false;
    return () => { if (!released) { fs.unlinkSync(file); released = true; } };
  }
  actor(role: "desktop" | "host" | "cli"): () => void {
    const file = path.join(this.directory, `actor-${process.pid}-${randomUUID()}.json`);
    const release = this.publish(file, this.owner(role));
    // Publish THEN check: either the exclusive owner sees us, or we see it and stop.
    if (fs.existsSync(path.join(this.directory, "exclusive.json"))) {
      release(); throw new Error("App reset is in progress. Retry after it finishes.");
    }
    return release;
  }
  blockAfterFailedShutdown(): void {
    fs.mkdirSync(this.directory, { recursive: true });
    fs.writeFileSync(path.join(this.directory, "shutdown-failed.json"), JSON.stringify(this.owner("host-shutdown-failed")), { mode: 0o600 });
  }
  exclusive(): () => void {
    if (fs.existsSync(path.join(this.directory, "shutdown-failed.json"))) throw new Error("A Host could not confirm shutdown. Inspect remaining child processes and shutdown-failed.json before resetting.");
    const file = path.join(this.directory, "exclusive.json");
    if (fs.existsSync(file)) {
      const owner = this.read(file);
      if (this.identify(owner.pid) === owner.started) throw new Error("Another app reset is in progress.");
      // Never unlink an exclusive lock based on a stale observation: another reclaimer
      // could replace it between identity inspection and unlink. Manual inspection is required.
      throw new Error("A previous reset was interrupted. Inspect exclusive.json before retrying; data was not deleted.");
    }
    const release = this.publish(file, this.owner("reset"));
    try {
      for (const name of fs.readdirSync(this.directory)) {
        if (!name.startsWith("actor-") || !name.endsWith(".json")) continue;
        const actorFile = path.join(this.directory, name), owner = this.read(actorFile);
        if (this.identify(owner.pid) === owner.started) throw new Error(`Close ${owner.role} (PID ${owner.pid}) before resetting. No process was stopped.`);
        // Actor filenames are unique and never reused, so dead generations can be removed.
        fs.unlinkSync(actorFile);
      }
      return release;
    } catch (error) { release(); throw error; }
  }
}
