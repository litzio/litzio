param([string]$Executable)
$ErrorActionPreference = 'Continue'
Write-Output "Removal failure at $([DateTime]::UtcNow.ToString('o')): $Executable"
Get-ChildItem -LiteralPath (Split-Path $Executable) -Recurse -Force | Select-Object FullName, Length, Attributes | Format-Table -AutoSize
Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine | ConvertTo-Json -Depth 3
Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager' -Name PendingFileRenameOperations -ErrorAction Continue | Format-List
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class RemovalLocks {
  [StructLayout(LayoutKind.Sequential)] public struct UniqueProcess { public uint pid; public System.Runtime.InteropServices.ComTypes.FILETIME start; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct Info {
    public UniqueProcess process;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=256)] public string name;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=64)] public string service;
    public uint type, status, session;
    [MarshalAs(UnmanagedType.Bool)] public bool restartable;
  }
  [DllImport("rstrtmgr.dll", CharSet=CharSet.Unicode)] static extern int RmStartSession(out uint handle, uint flags, StringBuilder key);
  [DllImport("rstrtmgr.dll", CharSet=CharSet.Unicode)] static extern int RmRegisterResources(uint handle, uint files, string[] names, uint apps, IntPtr processes, uint services, IntPtr serviceNames);
  [DllImport("rstrtmgr.dll")] static extern int RmGetList(uint handle, out uint needed, ref uint count, [In, Out] Info[] list, ref uint reason);
  [DllImport("rstrtmgr.dll")] static extern int RmEndSession(uint handle);
  public static string Query(string file) {
    uint handle; int result = RmStartSession(out handle, 0, new StringBuilder(33));
    if (result != 0) return "RmStartSession=" + result;
    try {
      result = RmRegisterResources(handle, 1, new[]{file}, 0, IntPtr.Zero, 0, IntPtr.Zero);
      if (result != 0) return "RmRegisterResources=" + result;
      uint needed, count=0, reason=0;
      result = RmGetList(handle, out needed, ref count, null, ref reason);
      if (result == 0) return "Restart Manager: no owners";
      if (result != 234) return "RmGetList=" + result;
      Info[] list = new Info[needed]; count=needed;
      result = RmGetList(handle, out needed, ref count, list, ref reason);
      var text = new StringBuilder("RmGetList=" + result);
      for (int i=0; i<count && i<list.Length; i++) text.Append("\nPID=" + list[i].process.pid + " name=" + list[i].name + " service=" + list[i].service);
      return text.ToString();
    } finally { RmEndSession(handle); }
  }
}
"@
[RemovalLocks]::Query($Executable)
try {
  $probe = [IO.File]::Open($Executable, 'Open', 'Read', 'None')
  $probe.Dispose()
  'Exclusive read probe succeeded (file is still present)'
} catch { $_ | Format-List * -Force }
