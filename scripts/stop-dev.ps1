[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$statePath = Join-Path $projectRoot 'logs\dev-processes.json'
if (-not (Test-Path -LiteralPath $statePath)) { Write-Output 'No recorded development session.'; exit 0 }
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
function Stop-OwnedProcessTree([int]$processId) {
    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $processId" -ErrorAction SilentlyContinue)
    foreach ($child in $children) { Stop-OwnedProcessTree -processId $child.ProcessId }
    Stop-Process -Id $processId -ErrorAction SilentlyContinue
}
foreach ($item in $state.processes) {
    $process = Get-Process -Id $item.id -ErrorAction SilentlyContinue
    if ($process -and $process.StartTime.ToUniversalTime().Ticks -eq [long]$item.startedTicks) {
        Stop-OwnedProcessTree -processId $item.id
        Write-Output "Stopped $($item.name)."
    }
}
Remove-Item -LiteralPath $statePath
