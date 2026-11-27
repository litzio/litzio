# Peak working set and private bytes of ONE process (children are not included).
# Usage: pwsh -File mem.ps1 -Runs 5 -Exe <path> -Arguments '<args>'  (env such as ELECTRON_RUN_AS_NODE is inherited)
param([int]$Runs = 5, [string]$Exe, [string]$Arguments)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class Mem {
  [StructLayout(LayoutKind.Sequential)]
  public struct Counters { public uint cb; public uint PageFaultCount; public UIntPtr PeakWorkingSetSize; public UIntPtr WorkingSetSize;
    public UIntPtr QuotaPeakPagedPoolUsage; public UIntPtr QuotaPagedPoolUsage; public UIntPtr QuotaPeakNonPagedPoolUsage; public UIntPtr QuotaNonPagedPoolUsage;
    public UIntPtr PagefileUsage; public UIntPtr PeakPagefileUsage; }
  [DllImport("psapi.dll", SetLastError = true)]
  public static extern bool GetProcessMemoryInfo(IntPtr process, out Counters counters, uint size);
  public static Counters Read(IntPtr handle) { Counters c; c.cb = (uint)Marshal.SizeOf(typeof(Counters)); GetProcessMemoryInfo(handle, out c, c.cb); return c; }
}
"@
$peaks = @(); $private = @()
for ($i = 0; $i -lt $Runs; $i++) {
  $info = [System.Diagnostics.ProcessStartInfo]::new($Exe, $Arguments)
  $info.UseShellExecute = $false; $info.RedirectStandardOutput = $true; $info.CreateNoWindow = $true
  $process = [System.Diagnostics.Process]::Start($info)
  $handle = $process.Handle  # keep the handle open so counters remain readable after exit
  $null = $process.StandardOutput.ReadToEnd(); $process.WaitForExit()
  $c = [Mem]::Read($handle)
  $peaks += [double]$c.PeakWorkingSetSize.ToUInt64() / 1MB; $private += [double]$c.PeakPagefileUsage.ToUInt64() / 1MB
  $process.Dispose()
}
$sortedPeaks = $peaks | Sort-Object; $sortedPrivate = $private | Sort-Object
"{0}`tpeakWorkingSetMB median {1:N1}`tpeakPrivateMB median {2:N1}" -f $Arguments.Substring(0, [Math]::Min(60, $Arguments.Length)), $sortedPeaks[[int][Math]::Floor($Runs / 2)], $sortedPrivate[[int][Math]::Floor($Runs / 2)]
