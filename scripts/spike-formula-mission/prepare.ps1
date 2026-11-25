param([Parameter(Mandatory)][string]$PluginRepository)
$ErrorActionPreference = 'Stop'
$checkout = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$repository = (Resolve-Path $PluginRepository).Path
$plugin = Join-Path $repository 'plugins/pdf-import'
$work = Join-Path $checkout 'tmp/http-host-a/formula-mission'
$baseline = Join-Path $checkout 'tmp/formula-mission/baseline'
if ((Test-Path $baseline) -or (Test-Path (Join-Path $work 'LSR-1.1-standards'))) {
    throw 'A converted fixture already exists. Use that baseline or start from a clean spike worktree.'
}
git -C $repository diff --quiet master -- plugins/pdf-import
if ($LASTEXITCODE) { throw 'PDF import source must match the plugin repository master.' }
$artifact = New-Item -ItemType Directory -Force (Join-Path $work 'pdf-import')
Get-ChildItem $plugin -File | Where-Object {
    $_.Extension -in '.js', '.jsx', '.mjs', '.json' -or $_.Name -eq 'PDFJS-LICENSE'
} | Copy-Item -Destination $artifact.FullName
Copy-Item -LiteralPath (Join-Path $plugin 'profiles') -Destination $artifact.FullName -Recurse
Copy-Item -LiteralPath (Join-Path $plugin 'node_modules') -Destination $artifact.FullName -Recurse
Copy-Item -LiteralPath (Join-Path $plugin 'test/fixtures/LSR-1.1-standards.pdf') -Destination $work
New-Item -ItemType Directory -Force (Join-Path $checkout 'tmp/http-host-b') | Out-Null

$priorHost = $env:LITZIO_BROWSER_HOST
Push-Location $checkout
try {
    $env:LITZIO_BROWSER_HOST = 'http'
    pnpm browser:test spike-formula-import
    if ($LASTEXITCODE) { throw 'PDF import browser scenario failed.' }
} finally {
    $env:LITZIO_BROWSER_HOST = $priorHost
    Pop-Location
}
New-Item -ItemType Directory -Force (Split-Path $baseline) | Out-Null
Copy-Item -LiteralPath (Join-Path $work 'LSR-1.1-standards') -Destination $baseline -Recurse
$mapping = Get-Content -Raw -Encoding utf8 (Join-Path $baseline 'LSR-1.1-standards.pdf-source.json') | ConvertFrom-Json
$key = Get-Content -Raw -Encoding utf8 (Join-Path $plugin 'test/fixtures/standards.json') | ConvertFrom-Json
$cases = foreach ($block in $mapping.blocks | Where-Object { $_.warning.code -eq 'formula-as-image' }) {
    $node = $mapping.snapshotNodes | Where-Object { ($_.path -join ',') -eq ($block.path -join ',') }
    $box = $block.boxes[0]
    $answer = $key.elements | Where-Object { $_.role -eq 'formula' -and $_.page -eq ($box.page + 1) -and [math]::Abs($_.bbox[1] - $box.top) -lt 3 }
    if (@($answer).Count -ne 1 -or !$node.imageUrl) { throw 'Cannot associate converted picture with the answer key.' }
    [ordered]@{ id = $answer.id; page = $answer.page; index = $block.path[0]; image = $node.imageUrl; latex = $answer.canonical.latex; number = $answer.source_number }
}
if (@($cases).Count -ne 3) { throw 'The converted LSR fixture must have three formula regions.' }
ConvertTo-Json -Depth 6 -InputObject @($cases) | Set-Content -Encoding utf8 (Join-Path $baseline 'formulas.json')
