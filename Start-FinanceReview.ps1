[CmdletBinding()]
param(
  [int]$Port = 3000,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppRoot = Join-Path $ProjectRoot 'app'
$Url = "http://127.0.0.1:$Port"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js was not found. Install Node.js 22.13 or newer.'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw 'npm was not found. Reinstall Node.js.'
}

$NodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($NodeMajor -lt 22) { throw 'FinanceReview requires Node.js 22.13 or newer.' }

if (-not (Test-Path -LiteralPath (Join-Path $AppRoot 'node_modules'))) {
  Write-Host 'Installing dependencies for the first run...' -ForegroundColor Cyan
  & npm.cmd ci --prefix $AppRoot
  if ($LASTEXITCODE -ne 0) { throw 'npm dependency installation failed.' }
}

if (-not $NoBrowser) {
  Start-Job -ScriptBlock {
    param($TargetUrl)
    for ($attempt = 0; $attempt -lt 90; $attempt++) {
      try {
        Invoke-WebRequest -Uri $TargetUrl -UseBasicParsing -TimeoutSec 2 | Out-Null
        Start-Process $TargetUrl
        return
      } catch {
        Start-Sleep -Seconds 1
      }
    }
  } -ArgumentList $Url | Out-Null
}

Write-Host "FinanceReview is starting at $Url. Press Ctrl+C to stop." -ForegroundColor Green
& npm.cmd run dev --prefix $AppRoot -- --port $Port
