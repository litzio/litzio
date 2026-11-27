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
/** A process the OS created this long after the writer's recorded start cannot be that writer (PID reuse).
 * The recorded start trails the OS creation time by tens of milliseconds; the margin also absorbs a small
 * backward system clock step between the writer's start and its record. */
const REUSE_MARGIN_MS = 5_000;

const errorCode = (error: unknown) => (error as NodeJS.ErrnoException).code;
function unlinkIfPresent(file: string) {
  try { fs.unlinkSync(file); } catch (error) { if (errorCode(error) !== "ENOENT") throw error; }
}
function exited(pid: number): boolean {
  try { process.kill(pid, 0); return false; } catch (error) { if (errorCode(error) === "ESRCH") return true; if (errorCode(error) === "EPERM") return false; throw error; }
}
/** Windows processStart values are .NET UTC ticks; other platforms' identities are not wall-clock times. */
function creationMs(started: string | undefined): number | undefined {
  return started && /^\d{15,20}$/.test(started) ? Number(BigInt(started) - 621_355_968_000_000_000n) / 10_000 : undefined;
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
  /** Publish the record, then hold it open without sharing for the process lifetime. The open handle only
   * proves a live writer; an openable record is judged by its PID and recorded start at reset. The record
   * has no `started`, so older resets refuse it as invalid instead of reclaiming it by identity mismatch. */
  private publishLease(file: string, role: ActorRole, flag: number) {
    fs.mkdirSync(this.directory, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ pid: process.pid, role, lease: "open-handle", approxStart: Date.now() - process.uptime() * 1000 }), { flag: "wx", mode: 0o600 });
    let fd: number | undefined;
    try { fd = fs.openSync(file, fs.constants.O_RDONLY | flag); }
    catch (error) { if (errorCode(error) !== "EBUSY") { unlinkIfPresent(file); throw error; } } // Another program has it open.
    let released = false;
    return () => { if (!released) { released = true; if (fd !== undefined) fs.closeSync(fd); unlinkIfPresent(file); } };
  }
  /** Judge a record without a creation identity by the PID in its unique filename. Only an exited PID, or a
   * process the OS created well after the writer's recorded start, is reclaimed; anything unverifiable refuses. */
  private requireReclaimable(name: string, owner: { approxStart?: unknown } | null | undefined): void {
    const [, digits, role] = /^actor-(\d+)-(?:(desktop|host|cli)-)?/.exec(name) ?? [];
    const pid = Number(digits);
    if (!Number.isSafeInteger(pid) || pid < 1) throw new Error("Invalid reset guard owner; inspect the guard directory.");
    if (exited(pid)) return;
    const writer = `${role ?? "the writer"} (PID ${pid})`;
    const recorded = owner?.approxStart;
    if (typeof recorded !== "number" || !Number.isFinite(recorded) || recorded <= 0) throw new Error(`Close ${writer} before resetting. No process was stopped.`);
    let created;
    try { created = creationMs(this.identify(pid)); }
    catch (error) { throw new Error(`Cannot verify ${writer} (${(error as Error).message}); no process was stopped and no data was deleted.`); }
    if (created !== undefined && created > recorded + REUSE_MARGIN_MS) return; // The PID now belongs to a later process.
    throw new Error(`Close ${writer} before resetting. No process was stopped.`);
  }
  actor(role: ActorRole): () => void {
    const file = path.join(this.directory, `actor-${process.pid}-${role}-${randomUUID()}.json`);
    const release = this.exclusiveSharing !== null ? this.publishLease(file, role, this.exclusiveSharing) : this.publish(file, this.owner(role));
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
        let bytes;
        try { bytes = fs.readFileSync(actorFile, "utf8"); } catch (error) {
          if (errorCode(error) === "ENOENT") continue; // Released after the listing.
          if (errorCode(error) === "EBUSY") {
            const [, pid, role] = /^actor-(\d+)-(desktop|host|cli)-/.exec(name) ?? [];
            throw new Error(`Close ${role ?? "the writer"}${pid ? ` (PID ${pid})` : ""} before resetting. No process was stopped.`);
          }
          throw new Error(`Cannot read reset guard owner ${name} (${errorCode(error) ?? "unknown"}); inspect the guard directory.`);
        }
        let owner: (Partial<Owner> & { approxStart?: unknown }) | null | undefined;
        try { owner = JSON.parse(bytes); } catch { /* Interrupted before its content was written. */ }
        if (owner && Number.isSafeInteger(owner.pid) && owner.pid! > 0 && typeof owner.started === "string" && owner.started) {
          // Identity record: the OS creation identity distinguishes a reused PID; processStart answers an exited PID without an OS query.
          if (this.identify(owner.pid!) === owner.started) throw new Error(`Close ${owner.role} (PID ${owner.pid}) before resetting. No process was stopped.`);
        } else this.requireReclaimable(name, owner);
        // Actor filenames are unique and never reused, so dead generations can be removed.
        unlinkIfPresent(actorFile);
      }
      return release;
    } catch (error) { release(); throw error; }
  }
}
