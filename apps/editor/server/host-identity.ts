import os from "node:os";
import { execFileSync } from "node:child_process";

let identity: { runAs: string } | undefined;
/** Process token identity, never the UI user or an environment-supplied account. */
export function hostIdentity(): { runAs: string } {
  if (!identity) {
    const runAs = process.platform === "win32"
      ? execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); [System.Security.Principal.WindowsIdentity]::GetCurrent().Name"], { encoding: "utf8", windowsHide: true, timeout: 5000 }).trim()
      : os.userInfo().username;
    if (!runAs) throw new Error("Could not determine Host execution account.");
    identity = { runAs };
  }
  return { ...identity };
}
