import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { daemonDirectory, readDaemonRecord, type DaemonRecord } from "../../editor/server/daemon-state.ts";

/** Private WM_APP intent, followed by ordinary WM_CLOSE (also works with pre-tray builds). */
export const INSTALLATION_CLOSE_MESSAGE = 0x8148;

// MainWindowHandle omits hidden windows. Enumerate the same top-level Electron windows
// for both discovery and close; no title/visibility dependency and no image-name termination.
const windowApi = `Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class DesktopWindows {
  delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder name, int size);
  [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll", SetLastError=true)] static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  public static IntPtr[] Find(uint owner) {
    var found = new List<IntPtr>();
    EnumWindows((h, p) => { uint pid; GetWindowThreadProcessId(h, out pid);
      var name = new StringBuilder(256); GetClassName(h, name, name.Capacity);
      if (pid == owner && name.ToString() == "Chrome_WidgetWin_1") found.Add(h);
      return true;
    }, IntPtr.Zero);
    return found.ToArray();
  }
  public static void Close(IntPtr h) {
    IntPtr result;
    if (SendMessageTimeout(h, ${INSTALLATION_CLOSE_MESSAGE}, IntPtr.Zero, IntPtr.Zero, 2, 2000, out result) == IntPtr.Zero)
      throw new Exception("Desktop installation exit intent was not delivered.");
    if (!PostMessage(h, 0x0010, IntPtr.Zero, IntPtr.Zero)) throw new Exception("Desktop WM_CLOSE was not delivered.");
  }
}
'@; `;

export type InstalledProcess = { pid: number; started: string; command: string; window: boolean; executable?: string };
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
  const target = realpathSync.native(executable).toLowerCase();
  const samePath = (file: string) => {
    try { return realpathSync.native(file).toLowerCase() === target; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
  };
  return {
    processes: () => JSON.parse(ps(
      windowApi + "$name = $inputText; ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq $name } | ForEach-Object { " +
      "@{ pid = $_.ProcessId; executable = $_.ExecutablePath; started = [string]$_.CreationDate.ToUniversalTime().Ticks; command = $_.CommandLine; window = ([DesktopWindows]::Find($_.ProcessId).Length -ne 0) } })", path.basename(executable)))
      // A live image whose alias disappeared is uncertain, not evidence of another install.
      .filter((p: InstalledProcess) => p.pid !== process.pid && p.executable && realpathSync.native(p.executable).toLowerCase() === target),
    records: () => (["stable", "beta", "development"] as const).flatMap(channel => {
      const record = readDaemonRecord(daemonDirectory(channel));
      return record && samePath(record.executable) ? [record] : [];
    }),
    closeWindows: processes => { if (processes.length) ps(
      windowApi + "$owners = ConvertFrom-Json $inputText; foreach ($owner in $owners) { " +
      "$current = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $owner.pid); " +
      "if ($current -and $current.ExecutablePath -eq $owner.executable -and [string]$current.CreationDate.ToUniversalTime().Ticks -eq $owner.started) { " +
      "foreach ($handle in [DesktopWindows]::Find($owner.pid)) { [DesktopWindows]::Close($handle) } } }", JSON.stringify(processes)); },
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

/** Installation intent + WM_CLOSE retains unsaved-work confirmation; IPC disconnect stops its daemon. */
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
