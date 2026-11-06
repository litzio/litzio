import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { brand } from "../../../brand.ts";
import { hostPaths, type HostRun } from "./host-paths.ts";
import { daemonDirectory, processStart } from "./daemon-state.ts";
import { remoteHostsFile } from "./remote-host-registry.ts";
import { ResetGuard } from "./reset-guard.ts";
import { resetStorageTargets, clearOfflineResetStorage, type ResetStorageLocations } from "./reset-storage.ts";

export function localResetLocations(userData?: string, updaterCache?: string, run?: HostRun): ResetStorageLocations {
  if (process.platform !== "win32" && (!userData || !updaterCache)) throw new Error("Specify the Desktop profile and updater cache on this platform.");
  const raw = hostPaths(run, { ...process.env });
  const host = { ...raw, templates: path.resolve(raw.templates), assistant: path.resolve(raw.assistant), settingsFile: (id: string) => path.resolve(raw.settingsFile(id)) };
  return { userData: userData ?? path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), brand.folders.desktopData),
    updaterCache: updaterCache ?? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), `${brand.appName}-updater`),
    host, remoteHostsFile: path.resolve(remoteHostsFile()), daemonDirectories: ["stable", "beta", "development"].map(channel => path.resolve(daemonDirectory(channel as "stable" | "beta" | "development"))) };
}

export const resetHostPaths = (paths = hostPaths()) => ({ templates: path.resolve(paths.templates), assistant: path.resolve(paths.assistant),
  assistantSettings: path.resolve(paths.settingsFile("assistant")), pluginSettings: path.resolve(paths.settingsFile("plugins")) });

export function inspectAppReset(locations: ResetStorageLocations) {
  const targets = resetStorageTargets(locations);
  const revision = createHash("sha256").update(JSON.stringify(targets)).digest("hex");
  return { operation: "app-reset", scope: "local-app-and-host", revision, targets,
    retained: ["External documents and separately saved files", "External plugin source/artifacts", "Other browser profiles, including their Litzio origin data", "Codex/Copilot global accounts and provider-side data", "Application installation and CLI integration"] } as const;
}

/** Legacy discovery is checked in addition to the process gate. A lock with uncertain
 * contents/identity refuses reset; an unresponsive process is never assumed to have exited.
 */
function checkRecordedWriters(locations: ResetStorageLocations, identify: typeof processStart) {
  const directories = [...locations.daemonDirectories, path.dirname(locations.remoteHostsFile), `${locations.remoteHostsFile}.work`];
  for (const directory of directories) {
    if (!fs.existsSync(directory)) continue;
    for (const name of fs.readdirSync(directory)) {
      if (!(name.endsWith(".lock") || name === "instance.json" || directory.endsWith(".work") && name.endsWith(".json"))) continue;
      let record;
      try { record = JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")); }
      catch { throw new Error("Cannot read a Desktop/daemon ownership record. Inspect it before resetting; no data was deleted."); }
      if (!Number.isSafeInteger(record.pid) || record.pid < 1 || typeof record.processStartedAt !== "string" || !record.processStartedAt) throw new Error("Cannot verify a recorded Desktop/daemon owner. Inspect its record before resetting.");
      if (identify(record.pid) === record.processStartedAt) throw new Error(`Close the Desktop or stop the daemon (PID ${record.pid}) before resetting. No process was stopped.`);
    }
  }
}

/** Shared local operation for the CLI and Desktop's post-exit helper. No remote execution. */
export function executeAppReset(locations: ResetStorageLocations, input: { confirmed: boolean; revision: string; removeFolders: boolean },
  guard = new ResetGuard(), identify = processStart) {
  const plan = inspectAppReset(locations);
  if (!input.confirmed || input.revision !== plan.revision) return { outcome: "refused" as const, reason: "Review the current reset plan and explicitly confirm it.", plan };
  let release: (() => void) | undefined;
  try {
    release = guard.exclusive();
    checkRecordedWriters(locations, identify);
    const receipt = clearOfflineResetStorage(plan.targets, { removeFolders: input.removeFolders,
      protectedPaths: [os.homedir(), guard.directory, process.execPath, process.cwd(),
        ...["Documents", "Desktop", "Downloads"].map(name => path.join(os.homedir(), name)),
        ...[process.env.APPDATA, process.env.LOCALAPPDATA].filter((value): value is string => !!value)] });
    return { outcome: receipt.status === "cleared" ? "success" as const : receipt.status === "refused" ? "refused" as const : "partial" as const,
      plan, receipt };
  } catch (error) { return { outcome: "refused" as const, reason: (error as Error).message, plan }; }
  finally { release?.(); }
}
