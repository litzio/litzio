param(
  [Parameter(Mandatory)][string] $Evidence,
  [Parameter(Mandatory)][string] $CopilotDirectory,
  [ValidateSet('core', 'extended')][string] $Group = 'core',
  [ValidateSet(3, 5)][int] $Repeat = 5
)

$ErrorActionPreference = 'Stop'
if ($Group -eq 'core' -and $Repeat -ne 5) { throw 'The first six steps require five runs.' }
$taskIds = if ($Group -eq 'core') {
  '1a','1b','2a','2b','2c','2d','3a','3b','3c','4a','4b','4c','5a','5b','5c','5d','5e','6a','6b','6c'
} else {
  '7a','7b','7c','8a','8b'
}
$checkout = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$tsx = Join-Path $checkout 'node_modules/tsx/dist/cli.mjs'
$timer = [Diagnostics.Stopwatch]::StartNew()
foreach ($n in 1..$Repeat) {
  foreach ($taskId in $taskIds) {
    $out = Join-Path $Evidence "$taskId-$n"
    $resultPath = Join-Path $out 'result.json'
    if (Test-Path -LiteralPath $out) {
      if (!(Test-Path -LiteralPath $resultPath)) { throw "Missing result for $taskId-$n." }
      $previous = Get-Content -Raw -LiteralPath $resultPath | ConvertFrom-Json
      if ($previous.error -or !$previous.stop) { throw "Incomplete result for $taskId-$n." }
      continue
    }
    "[{0}] {1}-{2}" -f (Get-Date -Format 'HH:mm:ss'), $taskId, $n
    & node $tsx (Join-Path $PSScriptRoot 'task-driver.ts') $taskId $out $CopilotDirectory
    if ($LASTEXITCODE -ne 0) { throw "The harness failed on $taskId-$n." }
    $observed = Get-Content -Raw -LiteralPath $resultPath | ConvertFrom-Json
    if ($observed.modelRequests -eq 0) { throw "No model request observed for $taskId-$n." }
    if ($observed.requests.error.code -match 'quota|rate_limit|usage_limit|capacity') {
      throw 'The Ollama request reported a capacity or usage error.'
    }
  }
}
"Batch wall time: {0:N1}s" -f $timer.Elapsed.TotalSeconds
