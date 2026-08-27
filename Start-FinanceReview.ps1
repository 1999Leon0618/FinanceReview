[CmdletBinding()]
param(
  [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppRoot = Join-Path $ProjectRoot 'app'
$Url = "http://127.0.0.1:$Port"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw '找不到 Node.js。請先安裝 Node.js 22.13 以上版本。'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw '找不到 npm。請重新安裝 Node.js。'
}

$NodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($NodeMajor -lt 22) { throw 'FinanceReview 需要 Node.js 22.13 以上版本。' }

if (-not (Test-Path -LiteralPath (Join-Path $AppRoot 'node_modules'))) {
  Write-Host '第一次啟動，正在安裝相依套件…' -ForegroundColor Cyan
  & npm.cmd ci --prefix $AppRoot
  if ($LASTEXITCODE -ne 0) { throw 'npm 套件安裝失敗。' }
}

if (-not (Get-Command openclaw -ErrorAction SilentlyContinue)) {
  Write-Warning '找不到 OpenClaw；自然語言解析暫時無法使用，仍可手動填寫確認表。'
}
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
  Write-Warning '找不到 Ollama；自然語言解析需要本機 ollama/gemma4:26b。'
} else {
  $Models = (& ollama list 2>$null | Out-String)
  if ($Models -notmatch 'gemma4:26b') {
    Write-Warning 'Ollama 尚未找到 gemma4:26b；請先執行 ollama pull gemma4:26b。'
  }
}

Write-Host '正在初始化本機 SQLite…' -ForegroundColor Cyan
& npm.cmd run db:init --prefix $AppRoot
if ($LASTEXITCODE -ne 0) { throw '資料庫初始化失敗。' }

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

Write-Host "FinanceReview 將在 $Url 啟動。按 Ctrl+C 可停止服務。" -ForegroundColor Green
& npm.cmd run dev --prefix $AppRoot -- --port $Port
