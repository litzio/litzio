param(
    [Parameter(Mandatory)][string]$CopilotCliDirectory
)
$ErrorActionPreference = 'Stop'
$checkout = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$fixture = Join-Path $checkout 'tmp/formula-mission/baseline'
$instructions = Join-Path $checkout 'apps/editor/server/assistant/AGENTS.md'
$original = [System.IO.File]::ReadAllBytes($instructions)
$hint = Get-Content -Raw -Encoding utf8 (Join-Path $PSScriptRoot 'replacement-hint.md')
$marker = '## 문서 읽기와 쓰기'
try {
    $source = [System.Text.Encoding]::UTF8.GetString($original)
    if (!$source.Contains($marker)) { throw 'Assistant instructions have changed.' }
    $updated = $source.Replace($marker, $marker + [Environment]::NewLine + $hint.TrimEnd())
    [System.IO.File]::WriteAllText($instructions, $updated)
    Push-Location $checkout
    try {
        foreach ($repeat in 1..3) {
            $output = Join-Path $checkout "tmp/formula-mission/B-hint-$repeat"
            pnpm exec tsx scripts/spike-formula-mission/task-driver.ts B-hint $fixture $output $CopilotCliDirectory
            if ($LASTEXITCODE) { throw "B-hint-$repeat did not complete." }
        }
    } finally { Pop-Location }
} finally {
    [System.IO.File]::WriteAllBytes($instructions, $original)
}
