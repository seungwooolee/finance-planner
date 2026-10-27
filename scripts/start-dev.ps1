[CmdletBinding()]
param([int]$FrontendPort = 3000, [int]$BackendPort = 8000)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$backendDirectory = Join-Path $projectRoot 'backend'
$frontendDirectory = Join-Path $projectRoot 'frontend'
$pythonPath = Join-Path $backendDirectory '.venv\Scripts\python.exe'
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$nextPath = Join-Path $frontendDirectory 'node_modules\next\dist\bin\next'
$logDirectory = Join-Path $projectRoot 'logs'
$statePath = Join-Path $logDirectory 'dev-processes.json'

if (-not (Test-Path -LiteralPath $pythonPath)) {
    throw 'Install backend requirements in backend/.venv first. See README.md.'
}
if (-not (Test-Path -LiteralPath $nextPath)) {
    throw 'Run npm.cmd ci in frontend first. See README.md.'
}
if (Test-Path -LiteralPath $statePath) {
    throw 'A previous development session is recorded. Run scripts/stop-dev.ps1 first.'
}
foreach ($port in @($FrontendPort, $BackendPort)) {
    if ($port -lt 1024 -or $port -gt 65535) { throw "Invalid local port: $port" }
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
        throw "Port $port is already in use. Choose another port or stop its owner."
    }
}
if ($FrontendPort -eq $BackendPort) { throw 'Frontend and backend ports must differ.' }
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$started = @()
$previousBackendUrl = $env:BACKEND_URL
try {
    $api = Start-Process -FilePath $pythonPath -WorkingDirectory $backendDirectory `
        -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', "$BackendPort") `
        -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $logDirectory 'backend.stdout.log') `
        -RedirectStandardError (Join-Path $logDirectory 'backend.stderr.log')
    $started += @{ name = 'backend'; id = $api.Id; startedTicks = $api.StartTime.ToUniversalTime().Ticks }
    @{ processes = $started; frontendPort = $FrontendPort; backendPort = $BackendPort } |
        ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $statePath -Encoding utf8
    $env:BACKEND_URL = "http://127.0.0.1:$BackendPort"
    $quotedNextPath = '"' + $nextPath + '"'
    $web = Start-Process -FilePath $nodePath -WorkingDirectory $frontendDirectory `
        -ArgumentList @($quotedNextPath, 'dev', '--hostname', '127.0.0.1', '--port', "$FrontendPort") `
        -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $logDirectory 'frontend.stdout.log') `
        -RedirectStandardError (Join-Path $logDirectory 'frontend.stderr.log')
    $started += @{ name = 'frontend'; id = $web.Id; startedTicks = $web.StartTime.ToUniversalTime().Ticks }
    @{ processes = $started; frontendPort = $FrontendPort; backendPort = $BackendPort } |
        ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $statePath -Encoding utf8

    $deadline = (Get-Date).AddSeconds(60)
    $ready = $false
    while ((Get-Date) -lt $deadline) {
        if ($api.HasExited -or $web.HasExited) { throw 'A server exited. Check logs/.' }
        try {
            $health = Invoke-WebRequest -Uri "http://127.0.0.1:$BackendPort/health" -UseBasicParsing -TimeoutSec 2
            $page = Invoke-WebRequest -Uri "http://127.0.0.1:$FrontendPort" -UseBasicParsing -TimeoutSec 5
            if ($health.StatusCode -eq 200 -and $page.StatusCode -eq 200) { $ready = $true; break }
        } catch { Start-Sleep -Milliseconds 500 }
    }
    if (-not $ready) { throw 'Servers did not become ready within 60 seconds. Check logs/.' }
    Write-Output "LifePath AI: http://127.0.0.1:$FrontendPort"
    Write-Output "API documentation: http://127.0.0.1:$BackendPort/docs"
    Write-Output 'Stop with: .\scripts\stop-dev.ps1'
} catch {
    if (Test-Path -LiteralPath $statePath) { & (Join-Path $PSScriptRoot 'stop-dev.ps1') }
    else { foreach ($item in $started) { Stop-Process -Id $item.id -ErrorAction SilentlyContinue } }
    throw
} finally {
    $env:BACKEND_URL = $previousBackendUrl
}
