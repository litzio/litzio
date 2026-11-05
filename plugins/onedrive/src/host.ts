import { readAccounts, type RegistryResult } from "./registry.ts";
import type { PluginContext, PluginStatus, PluginInstance } from "@litzio/plugin-sdk";
import path from "node:path";
export function detect(context: PluginContext, registry: () => RegistryResult = readAccounts): PluginStatus {
  if (context.platform !== "win32") return { available: false, message: "OneDrive detection is not supported on this Host OS.", folders: [], decorations: [], accounts: [] };
  const seen = new Set<string>();
  const candidates = ["OneDrive", "OneDriveConsumer", "OneDriveCommercial"].flatMap(source => {
    const directory = context.env[source];
    if (!directory || !path.win32.isAbsolute(directory) || !context.isDirectory(directory)) return [];
    const normalized = path.win32.normalize(directory), key = normalized.toLowerCase().replace(/[\\/]+$/, "");
    if (seen.has(key)) return []; seen.add(key);
    return [{ path: normalized, label: path.win32.basename(normalized), source }];
  });
  const registration = registry();
  let missing = 0;
  for (const account of registration.accounts) {
    if (!account.UserFolder || !path.win32.isAbsolute(account.UserFolder) || !context.isDirectory(account.UserFolder)) { missing++; continue; }
    const directory = path.win32.normalize(account.UserFolder), key = directory.toLowerCase().replace(/[\\/]+$/, "");
    const existing = candidates.find(v => v.path.toLowerCase().replace(/[\\/]+$/, "") === key);
    const label = account.UserEmail || account.DisplayName;
    if (existing) { if (label) existing.label = label; existing.source += "; HKCU Accounts"; }
    else { seen.add(key); candidates.push({ path: directory, label: label || path.win32.basename(directory), source: "HKCU Accounts" }); }
  }
  const details = `${registration.complete ? "Registration checked" : "Registration unavailable"}; ${missing} incomplete or missing paths.`;
  return { available: true, message: details + " " + (candidates.length ? "Detected folders; login and sync status are unverified." : "No OneDrive folder detected."),
    folders: candidates.map((v, index) => ({ id: `folder-${index}`, path: v.path, label: v.label, defaultCandidate: candidates.length === 1 })),
    decorations: candidates.map((v, index) => ({ id: `folder-${index}`, path: v.path, icon: "onedrive" })),
    accounts: candidates.map((v, index) => ({ id: `folder-${index}`, label: v.label, source: `${v.source}: ${v.path}` })) };
}
export function activate(context: PluginContext): PluginInstance {
  return { operations: {}, status: () => detect(context), dispose() {} };
}
