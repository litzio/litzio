$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
pnpm --filter @litzio/editor exec vite --config interview.config.ts
