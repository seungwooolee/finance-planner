[CmdletBinding()]
param([int]$FrontendPort = 3000, [int]$BackendPort = 8001, [switch]$BackendOnly)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$backendDirectory = Join-Path $projectRoot 'backend'
$frontendDirectory = Join-Path $projectRoot 'frontend'
$pythonPath = Join-Path $backendDirectory '.venv\Scripts\python.exe'
$nextPath = Join-Path $frontendDirectory 'node_modules\next\dist\bin\next'
$logDirectory = Join-Path $projectRoot 'logs'
$statePath = Join-Path $logDirectory 'dev-processes.json'

if (-not (Test-Path -LiteralPath $pythonPath)) {
    throw 'Install backend requirements in backend/.venv first. See README.md.'
}
if (-not $BackendOnly) {
    $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
    if (-not (Test-Path -LiteralPath $nextPath)) {
        throw 'Run npm.cmd ci in frontend first. See README.md.'
    }
}
if (Test-Path -LiteralPath $statePath) {
    throw 'A previous development session is recorded. Run scripts/stop-dev.ps1 first.'
}
$requiredPorts = if ($BackendOnly) { @($BackendPort) } else { @($FrontendPort, $BackendPort) }
foreach ($port in $requiredPorts) {
    if ($port -lt 1024 -or $port -gt 65535) { throw "Invalid local port: $port" }
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
        throw "Port $port is already in use. Choose another port or stop its owner."
    }
}
if (-not $BackendOnly -and $FrontendPort -eq $BackendPort) { throw 'Frontend and backend ports must differ.' }
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$started = @()
$previousBackendUrl = $env:BACKEND_URL
try {
    $api = Start-Process -FilePath $pythonPath -WorkingDirectory $backendDirectory `
        -ArgumentList @('-m', 'uvicorn', 'app.be_server:app', '--host', '127.0.0.1', '--port', "$BackendPort") `
        -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $logDirectory 'backend.stdout.log') `
        -RedirectStandardError (Join-Path $logDirectory 'backend.stderr.log')
    $started += @{ name = 'backend'; id = $api.Id; startedTicks = $api.StartTime.ToUniversalTime().Ticks }
    @{ processes = $started; frontendPort = $FrontendPort; backendPort = $BackendPort } |
        ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $statePath -Encoding utf8
    if (-not $BackendOnly) {
        $env:BACKEND_URL = "http://127.0.0.1:$BackendPort"
        $quotedNextPath = '"' + $nextPath + '"'
        $web = Start-Process -FilePath $nodePath -WorkingDirectory $frontendDirectory `
            -ArgumentList @($quotedNextPath, 'dev', '--hostname', '127.0.0.1', '--port', "$FrontendPort") `
            -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $logDirectory 'frontend.stdout.log') `
            -RedirectStandardError (Join-Path $logDirectory 'frontend.stderr.log')
        $started += @{ name = 'frontend'; id = $web.Id; startedTicks = $web.StartTime.ToUniversalTime().Ticks }
    }
    @{ processes = $started; frontendPort = $FrontendPort; backendPort = $BackendPort } |
        ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $statePath -Encoding utf8

    $deadline = (Get-Date).AddSeconds(60)
    $ready = $false
    while ((Get-Date) -lt $deadline) {
        if ($api.HasExited -or (-not $BackendOnly -and $web.HasExited)) { throw 'A server exited. Check logs/.' }
        try {
            $health = Invoke-WebRequest -Uri "http://127.0.0.1:$BackendPort/health" -UseBasicParsing -TimeoutSec 2
            if ($health.StatusCode -eq 200) {
                $contract = Invoke-RestMethod -Uri "http://127.0.0.1:$BackendPort/openapi.json" -TimeoutSec 5
                if (-not $contract.paths.'/api/fe/v1/preview') { throw 'DION preview API is missing from this server.' }
                if ($BackendOnly) { $ready = $true; break }
                $page = Invoke-WebRequest -Uri "http://127.0.0.1:$FrontendPort/dion" -UseBasicParsing -TimeoutSec 5
                if ($page.StatusCode -eq 200) { $ready = $true; break }
            }
        } catch { Start-Sleep -Milliseconds 500 }
    }
    if (-not $ready) { throw 'Servers did not become ready within 60 seconds. Check logs/.' }
    if ($BackendOnly) { Write-Output "Backend ready: http://127.0.0.1:$BackendPort/health" }
    else { Write-Output "DION: http://127.0.0.1:$FrontendPort/dion" }
    Write-Output "API documentation: http://127.0.0.1:$BackendPort/docs"
    Write-Output 'Stop with: .\scripts\stop-dev.ps1'
} catch {
    if (Test-Path -LiteralPath $statePath) { & (Join-Path $PSScriptRoot 'stop-dev.ps1') }
    else { foreach ($item in $started) { Stop-Process -Id $item.id -ErrorAction SilentlyContinue } }
    throw
} finally {
    $env:BACKEND_URL = $previousBackendUrl
}
