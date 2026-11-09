import fs from "node:fs";
import path from "node:path";
import type { hostPaths } from "./host-paths.ts";

export type ResetStorageTarget = { path: string; kind: "file" | "directory"; contents: string };
export type ResetStorageLocations = {
  userData: string;
  host: ReturnType<typeof hostPaths>;
  remoteHostsFile: string;
  daemonDirectories: string[];
  updaterCache: string;
};

/** Internal, offline inventory. Locations must come from the owning runtimes, never HTTP input.
 * No defaults: the eventual coordinator must supply the actual profile and all affected channels.
 * Registered plugin artifact paths and document paths are deliberately never traversed.
 */
export function resetStorageTargets(locations: ResetStorageLocations): ResetStorageTarget[] {
  const plugins = locations.host.settingsFile("plugins");
  return [
    { path: locations.userData, kind: "directory", contents: "Desktop preferences, browser storage/recovery, logs and edited samples" },
    { path: locations.host.templates, kind: "directory", contents: "User templates" },
    { path: locations.host.assistant, kind: "directory", contents: "Local conversations, assistant files and skills" },
    { path: locations.host.settingsFile("assistant"), kind: "file", contents: "Assistant settings" },
    { path: plugins, kind: "file", contents: "Plugin registrations, trust and settings" },
    { path: `${plugins}.secrets`, kind: "directory", contents: "Plugin secrets" },
    { path: locations.host.settingsFile("generated-documents") + ".d", kind: "directory", contents: "Host-managed generated document connections" },
    { path: path.join(path.dirname(plugins), "plugins"), kind: "directory", contents: "Host-owned saved views and snapshots" },
    { path: locations.remoteHostsFile, kind: "file", contents: "Desktop remote Host registrations" },
    { path: `${locations.remoteHostsFile}.work`, kind: "directory", contents: "Desktop work summaries" },
    ...locations.daemonDirectories.map(directory => ({ path: directory, kind: "directory" as const, contents: "Stopped daemon discovery, locks and logs" })),
    { path: locations.updaterCache, kind: "directory", contents: "Downloaded update cache" },
    { path: path.dirname(locations.host.templates), kind: "directory", contents: "All Host-owned data, including interrupted settings writes" },
    { path: path.dirname(locations.remoteHostsFile), kind: "directory", contents: "Desktop registration data and interrupted writes" },
    ...Array.from(new Set(locations.daemonDirectories.map(directory => path.dirname(directory)))).map(directory => ({ path: directory, kind: "directory" as const, contents: "All daemon channel data" })),
    ...[locations.host.settingsFile("assistant"), plugins].flatMap(file => {
      const parent = path.dirname(file);
      if (!fs.existsSync(parent)) return [];
      return fs.readdirSync(parent).sort().filter(name => name.startsWith(path.basename(file) + ".") && /^[0-9a-f-]{36}\.tmp$/i.test(name.slice(path.basename(file).length + 1)))
        .map(name => ({ path: path.join(parent, name), kind: "file" as const, contents: "Interrupted settings write" }));
    }),
  ];
}

function within(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

function checked(target: ResetStorageTarget, protectedPaths: readonly string[]): void {
  const absolute = path.resolve(target.path);
  if (!path.isAbsolute(target.path) || absolute === path.parse(absolute).root ||
      protectedPaths.some(protectedPath => within(absolute, path.resolve(protectedPath)))) {
    throw new Error("Reset target is relative, a filesystem root, or contains a protected location.");
  }
  // Refuse redirected roots/ancestors. Links INSIDE an owned directory are unlinked by rm,
  // never recursively followed. Quiescence is a coordinator prerequisite, not proven here.
  for (let current = absolute; ; current = path.dirname(current)) {
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) throw new Error("Reset target has a symbolic link or junction ancestor.");
    if (stat && (current === absolute ? target.kind === "directory" ? !stat.isDirectory() : !stat.isFile() : !stat.isDirectory())) {
      throw new Error("Reset target has an unexpected filesystem type.");
    }
    if (path.dirname(current) === current) break;
  }
}

export type ResetStorageReceipt = {
  scope: "offline-storage-only";
  status: "cleared" | "partial" | "refused";
  results: { path: string; status: "cleared" | "failed"; error?: string }[];
  reason?: string;
};

/** Not a complete-reset operation. Call only AFTER all affected writers have stopped and the
 * user has reviewed the targets. This module neither authorizes deletion nor stops processes.
 * removeFolders=false still removes ALL data; it only retains empty target directories.
 */
export function clearOfflineResetStorage(
  targets: readonly ResetStorageTarget[],
  options: { removeFolders: boolean; protectedPaths: readonly string[] },
  remove: (target: string) => void = target => fs.rmSync(target, { recursive: true, force: true }),
): ResetStorageReceipt {
  // Copy before validating: callbacks must not change the reviewed execution plan.
  const plan = targets.map(target => ({ ...target }));
  const removeFolders = options.removeFolders;
  const protectedPaths = [...options.protectedPaths];
  try {
    if (!plan.length || !protectedPaths.length || protectedPaths.some(value => !path.isAbsolute(value))) {
      throw new Error("Reset requires targets and absolute protected locations.");
    }
    for (const target of plan) checked(target, protectedPaths);
  } catch (error) {
    return { scope: "offline-storage-only", status: "refused", results: [], reason: (error as Error).message };
  }
  const results: ResetStorageReceipt["results"] = [];
  // Delete a containing owned directory once, rather than retrying a failed leaf via
  // an overlapping parent later. All declared children were still preflight-checked.
  const execution = plan.filter((target, index) => !plan.some((other, otherIndex) =>
    (otherIndex < index && path.relative(other.path, target.path) === "") ||
    (other.kind === "directory" && path.relative(other.path, target.path) !== "" && within(other.path, target.path))));
  for (const target of execution) {
    try {
      checked(target, protectedPaths);
      if (target.kind === "directory" && !removeFolders) {
        const stat = fs.lstatSync(target.path, { throwIfNoEntry: false });
        if (stat) for (const entry of fs.readdirSync(target.path)) remove(path.join(target.path, entry));
      } else remove(target.path);
      const remaining = fs.lstatSync(target.path, { throwIfNoEntry: false });
      if (remaining && (target.kind !== "directory" || removeFolders || !remaining.isDirectory() || remaining.isSymbolicLink() || fs.readdirSync(target.path).length)) {
        throw new Error("Reset data remains after deletion.");
      }
      results.push({ path: target.path, status: "cleared" });
    } catch (error) {
      // Do not return arbitrary filesystem error messages (or plugin/secret contents).
      results.push({ path: target.path, status: "failed", error: (error as NodeJS.ErrnoException).code ?? "Deletion or verification failed" });
    }
  }
  return { scope: "offline-storage-only", status: results.some(result => result.status === "failed") ? "partial" : "cleared", results };
}
