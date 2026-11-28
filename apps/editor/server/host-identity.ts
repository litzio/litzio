import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
let identity: Promise<{ runAs: string }> | undefined;

/** Process token identity, never the UI user or an environment-supplied account. */
export async function hostIdentity(): Promise<{ runAs: string }> {
  identity ??= readHostIdentity().catch(error => {
    identity = undefined;
    throw error;
  });
  return { ...await identity };
}

async function readHostIdentity(): Promise<{ runAs: string }> {
  // os.userInfo() gives a bare username on Windows. Keep the token's qualified name.
  const runAs = process.platform === "win32"
    ? (await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); [System.Security.Principal.WindowsIdentity]::GetCurrent().Name"], { encoding: "utf8", windowsHide: true, timeout: 5000 })).stdout.trim()
    : os.userInfo().username;
  if (!runAs) throw new Error("Could not determine Host execution account.");
  return { runAs };
}
