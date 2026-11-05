param([int]$UninstallerPid, [string]$Executable, [ValidateSet('', 'transient', 'persistent')][string]$LockMode = '')
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class Dialogs {
  public delegate bool Visitor(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Visitor v, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr h, Visitor v, IntPtr p);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  public static string Text(IntPtr h) { var s = new StringBuilder(8192); GetWindowText(h,s,s.Capacity); return s.ToString(); }
  public static string Class(IntPtr h) { var s = new StringBuilder(256); GetClassName(h,s,s.Capacity); return s.ToString(); }
}
'@
$deadline = [DateTime]::UtcNow.AddSeconds(45)
$seen = [Collections.Generic.HashSet[string]]::new()
try {
while (Get-Process -Id $UninstallerPid -ErrorAction SilentlyContinue) {
  if ($LockMode -eq 'transient' -and $script:imageLock -and
      (Get-Content -LiteralPath $script:removalLog -Raw -Encoding Unicode) -match 'App executable deletion attempt') {
    $script:imageLock.Dispose()
    $script:imageLock = $null
    Write-Host 'Released image lock after observed deletion failure'
  }
  if ([DateTime]::UtcNow -gt $deadline) {
    $processes = @(Get-CimInstance Win32_Process)
    $owned = [Collections.Generic.HashSet[int]]::new()
    [void]$owned.Add($UninstallerPid)
    do {
      $added = $false
      foreach ($candidate in $processes) {
        if ($owned.Contains([int]$candidate.ParentProcessId) -and $owned.Add([int]$candidate.ProcessId)) { $added = $true }
      }
    } while ($added)
    $processes | Where-Object { $owned.Contains([int]$_.ProcessId) } |
      Select-Object ProcessId, ParentProcessId, Name, CommandLine |
      ConvertTo-Json -Depth 3 | Write-Host
    throw 'Owned uninstaller did not complete.'
  }
  [Dialogs]::EnumWindows({ param($window, $unused)
    [uint32]$ownerPid = 0
    [void][Dialogs]::GetWindowThreadProcessId($window, [ref]$ownerPid)
    if ($ownerPid -eq $UninstallerPid) {
      $script:dialogText = [Dialogs]::Text($window)
      $script:okButtons = @()
      [void][Dialogs]::EnumChildWindows($window, { param($control, $unusedChild)
        $label = [Dialogs]::Text($control)
        $class = [Dialogs]::Class($control)
        $script:dialogText += "`n$class $([Dialogs]::GetDlgCtrlID($control)): $label"
        if ($class -eq 'Button' -and $label -match '^&?OK$') { $script:okButtons += $control }
        return $true
      }, [IntPtr]::Zero)
      if ($seen.Add($script:dialogText)) { Write-Host $script:dialogText }
      if ($LockMode -and -not $script:lockAcquired -and $script:dialogText -match 'CLI cleanup incomplete') {
        # Acquire only after lifecycle/CLI helpers have exited, at the warning gate.
        # Allow reads/execution but deny deletion; release is driven by the retry log.
        $script:imageLock = [IO.File]::Open($Executable, 'Open', 'Read', 'ReadWrite')
        $script:lockAcquired = $true
        $script:removalLog = [regex]::Match($script:dialogText, 'Diagnostic: ([^\r\n]+)').Groups[1].Value.Trim()
        if (-not $script:removalLog) { throw 'No durable warning diagnostic to observe' }
        Write-Host "Holding image deletion lock: $LockMode"
      }
      foreach ($ok in $script:okButtons) {
        # Send the enabled button's standard BN_CLICKED notification to its own dialog.
        # BM_CLICK requires activation; this NSIS MessageBox exposes no UIA InvokePattern.
        if ([Dialogs]::IsWindowEnabled($ok) -and [Dialogs]::IsWindowVisible($ok)) {
          $controlId = [Dialogs]::GetDlgCtrlID($ok)
          Write-Host "Sending owned OK command: $window / $controlId"
          if (-not [Dialogs]::PostMessage([Dialogs]::GetParent($ok), 0x0111, [IntPtr]$controlId, $ok)) {
            throw 'Could not send the owned dialog command.'
          }
        }
      }
    }
    return $true
  }, [IntPtr]::Zero) | Out-Null
  Start-Sleep -Milliseconds 100
}
} finally { if ($script:imageLock) { $script:imageLock.Dispose() } }
