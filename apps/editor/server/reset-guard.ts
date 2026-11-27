import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { brand } from "../../../brand.ts";
import { processStart } from "./daemon-state.ts";

/** All channels/installations share this account-wide gate, independently of Host data overrides. */
const resetGuardDirectory = () => process.env.LITZIO_RESET_DIR ?? path.join(os.homedir(), `${brand.folders.shared}-reset-guard`);
type Owner = { pid: number; started: string; role: string };
type ActorRole = "desktop" | "host" | "cli";
let ownStart: string | undefined;

/** libuv's UV_FS_O_EXLOCK (include/uv/win.h, "EXCLUSIVE SHARING MODE"): CreateFile with share mode 0.
 * Node passes it through to libuv but does not export it in fs.constants. */
const UV_FS_O_EXLOCK = (fs.constants as Record<string, number | undefined>).UV_FS_O_EXLOCK ?? 0x10000000;
/** Written only while this process holds the file open without sharing. Readable means the handle is closed,
 * so the writer has exited (the kernel closes handles of any terminated process) or released it.
 * Older resets compare it with an OS creation identity, which never equals this value. */
const OPEN_HANDLE = "windows-open-handle";

const errorCode = (error: unknown) => (error as NodeJS.ErrnoException).code;
function unlinkIfPresent(file: string) {
  try { fs.unlinkSync(file); } catch (error) { if (errorCode(error) !== "ENOENT") throw error; }
}

/** A narrow process-lifetime gate: never kills another owner or treats HTTP silence as death. */
export class ResetGuard {
  /** `exclusiveSharing` is the open flag that denies all sharing; null records an OS creation identity instead. */
  constructor(readonly directory = resetGuardDirectory(), private identify = processStart,
    private exclusiveSharing: number | null = process.platform === "win32" ? UV_FS_O_EXLOCK : null) {}
  private owner(role: string): Owner {
    const started = this.identify === processStart ? ownStart ??= this.identify(process.pid) : this.identify(process.pid);
    if (!started) throw new Error("Cannot identify the reset guard owner.");
    return { pid: process.pid, started, role };
  }
  private read(file: string): Owner {
    const bytes = fs.readFileSync(file, "utf8");
    let owner;
    try { owner = JSON.parse(bytes); }
    catch { throw new Error("Invalid reset guard owner; inspect the guard directory."); }
    if (!Number.isSafeInteger(owner?.pid) || owner.pid < 1 || typeof owner.started !== "string" || !owner.started || !["desktop", "host", "cli", "reset", "host-shutdown-failed"].includes(owner.role)) throw new Error("Invalid reset guard owner; inspect the guard directory.");
    return owner;
  }
  private publish(file: string, owner: Owner) {
    fs.mkdirSync(this.directory, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(owner), { flag: "wx", mode: 0o600 });
    let released = false;
    return () => { if (!released) { fs.unlinkSync(file); released = true; } };
  }
  /** Hold the actor file open without sharing for the process lifetime. Returns undefined when the
   * platform did not enforce the lock, so the caller falls back to the OS creation identity. */
  private publishOpenHandle(file: string, role: ActorRole, flag: number): (() => void) | undefined {
    fs.mkdirSync(this.directory, { recursive: true });
    const { O_CREAT, O_EXCL, O_WRONLY } = fs.constants;
    const fd = fs.openSync(file, O_CREAT | O_EXCL | O_WRONLY | flag, 0o600);
    const abandon = () => { fs.closeSync(fd); fs.unlinkSync(file); };
    try {
      // Prove the lock before publishing the marker: a readable file must always mean a closed handle.
      let enforced = false;
      try { fs.closeSync(fs.openSync(file, "r")); } catch (error) { if (errorCode(error) === "EBUSY") enforced = true; }
      if (!enforced) { abandon(); return undefined; }
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, started: OPEN_HANDLE, role }));
    } catch (error) { abandon(); throw error; }
    let released = false;
    // A reset may remove the file once the handle is closed; the release is already complete then.
    return () => { if (!released) { released = true; fs.closeSync(fd); unlinkIfPresent(file); } };
  }
  actor(role: ActorRole): () => void {
    const file = path.join(this.directory, `actor-${process.pid}-${role}-${randomUUID()}.json`);
    const release = (this.exclusiveSharing !== null && this.publishOpenHandle(file, role, this.exclusiveSharing)) || this.publish(file, this.owner(role));
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
      let owner;
      try { owner = this.read(file); } catch (error) { throw errorCode(error) ? new Error("Invalid reset guard owner; inspect the guard directory.") : error; }
      if (this.identify(owner.pid) === owner.started) throw new Error("Another app reset is in progress.");
      // Never unlink an exclusive lock based on a stale observation: another reclaimer
      // could replace it between identity inspection and unlink. Manual inspection is required.
      throw new Error("A previous reset was interrupted. Inspect exclusive.json before retrying; data was not deleted.");
    }
    const release = this.publish(file, this.owner("reset"));
    try {
      for (const name of fs.readdirSync(this.directory)) {
        if (!name.startsWith("actor-") || !name.endsWith(".json")) continue;
        const actorFile = path.join(this.directory, name);
        let owner;
        try { owner = this.read(actorFile); } catch (error) {
          if (errorCode(error) === "ENOENT") continue; // Released after the listing.
          if (errorCode(error) === "EBUSY") {
            const [, pid, role] = /^actor-(\d+)-(desktop|host|cli)-/.exec(name) ?? [];
            throw new Error(`Close ${role ?? "the writer"}${pid ? ` (PID ${pid})` : ""} before resetting. No process was stopped.`);
          }
          throw errorCode(error) ? new Error(`Cannot read reset guard owner ${name} (${errorCode(error)}); inspect the guard directory.`) : error;
        }
        // An open-handle owner is alive exactly while its file is unreadable. Older identity owners use the OS
        // creation identity; processStart answers an exited PID without an OS query.
        if (owner.started !== OPEN_HANDLE && this.identify(owner.pid) === owner.started) throw new Error(`Close ${owner.role} (PID ${owner.pid}) before resetting. No process was stopped.`);
        // Actor filenames are unique and never reused, so dead generations can be removed.
        unlinkIfPresent(actorFile);
      }
      return release;
    } catch (error) { release(); throw error; }
  }
}
