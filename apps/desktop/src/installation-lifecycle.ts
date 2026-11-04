import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { daemonDirectory, readDaemonRecord, type DaemonRecord } from "../../editor/server/daemon-state.ts";

export type InstalledProcess = { pid: number; started: string; command: string; window: boolean };
export interface InstallationPort {
  processes(): InstalledProcess[];
  records(): DaemonRecord[];
  closeWindows(processes: InstalledProcess[]): void;
  recordsRemoved(records: DaemonRecord[]): boolean;
}

/** Never use image-name taskkill: another channel/installation can use the same image name. */
export function installationPort(executable: string): InstallationPort {
  const windows = process.env.WINDIR ?? "C:\\Windows";
  const ps = (script: string, input = "") => execFileSync(path.join(windows, "System32/WindowsPowerShell/v1.0/powershell.exe"),
    ["-NoProfile", "-NonInteractive", "-Command", `$ErrorActionPreference = 'Stop'; [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); $inputText = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd())); ${script}`],
    // PowerShell cannot even initialize with a damaged SystemRoot. Keep the OS query tied
    // to its Windows executable; do not repair the parent/optional CLI cleanup environment.
    { input: Buffer.from(input, "utf8").toString("base64"), encoding: "utf8", windowsHide: true, env: { ...process.env, SystemRoot: windows } });
  const samePath = (file: string) => path.resolve(file).toLowerCase() === path.resolve(executable).toLowerCase();
  return {
    processes: () => JSON.parse(ps(
      "$target = $inputText; ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $target } | ForEach-Object { " +
      "@{ pid = $_.ProcessId; started = [string]$_.CreationDate.ToUniversalTime().Ticks; command = $_.CommandLine; window = ((Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue).MainWindowHandle -ne 0) } })", executable)).filter((p: InstalledProcess) => p.pid !== process.pid),
    records: () => (["stable", "beta", "development"] as const).flatMap(channel => {
      const record = readDaemonRecord(daemonDirectory(channel));
      return record && samePath(record.executable) ? [record] : [];
    }),
    closeWindows: processes => { if (processes.length) ps(
      "$request = ConvertFrom-Json $inputText; foreach ($owner in $request.processes) { " +
      "$current = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $owner.pid); " +
      "if ($current -and $current.ExecutablePath -eq $request.executable -and [string]$current.CreationDate.ToUniversalTime().Ticks -eq $owner.started) { " +
      "$p = Get-Process -Id $owner.pid -ErrorAction SilentlyContinue; if ($p) { [void]$p.CloseMainWindow() } } }", JSON.stringify({ executable, processes })); },
    recordsRemoved: records => records.every(record => !existsSync(path.join(record.daemonHome, "instance.json")) && !existsSync(path.join(record.daemonHome, "daemon.lock"))),
  };
}

export function checkInstallation(port: InstallationPort): DaemonRecord[] {
  const processes = port.processes(), records = port.records();
  for (const record of records) {
    const live = processes.find(p => p.pid === record.pid && p.started === record.processStartedAt);
    if (live && record.launcher !== "desktop") throw new Error(`A CLI daemon is using this installation (PID ${record.pid}, ${record.daemonHome}). Stop it with the matching CLI: daemon stop --confirm --channel <channel> (or Ctrl+C for a foreground daemon), then try again.`);
  }
  // Manual CLI listeners have no discovery record. They must not be silently killed either.
  const unknown = processes.find(p => /cli\.mjs["\s]+daemon\s+run\b/i.test(p.command ?? "") && !records.some(r => r.pid === p.pid && r.processStartedAt === p.started && r.launcher === "desktop"));
  if (unknown) throw new Error(`A CLI daemon is using this installation (PID ${unknown.pid}). Stop it in its terminal or with the matching CLI, then try again.`);
  return records;
}

/** WM_CLOSE retains the Editor's unsaved-work confirmation; IPC disconnect stops its daemon. */
export async function prepareInstallation(port: InstallationPort): Promise<void> {
  const records = checkInstallation(port);
  port.closeWindows(port.processes().filter(p => p.window));
  const deadline = Date.now() + 10_000;
  while (port.processes().length) {
    if (Date.now() >= deadline) throw new Error("Installation is still in use. Close Desktop (save or discard pending work) and stop CLI daemons, then try again. No process was forcibly terminated.");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!port.recordsRemoved(records)) throw new Error("Daemon discovery/lock cleanup was not confirmed. Inspect the daemon log before trying again.");
}
