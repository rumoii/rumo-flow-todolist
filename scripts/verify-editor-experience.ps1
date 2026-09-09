param([int]$Port = 5188)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$env:COREPACK_ENABLE_AUTO_PIN = '0'
$env:RUMO_E2E_PORT = [string]$Port
pnpm typecheck
if ($LASTEXITCODE) { exit $LASTEXITCODE }
pnpm test
if ($LASTEXITCODE) { exit $LASTEXITCODE }
pnpm build
if ($LASTEXITCODE) { exit $LASTEXITCODE }
pnpm exec playwright test --workers=3
if ($LASTEXITCODE) { exit $LASTEXITCODE }
pnpm exec playwright test --config tests/electron.config.ts
if ($LASTEXITCODE) { exit $LASTEXITCODE }
git diff --check
exit $LASTEXITCODE
