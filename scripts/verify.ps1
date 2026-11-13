[CmdletBinding()]
param(
    [ValidateSet('Core', 'Build', 'E2E')]
    [string]$Mode = 'Core',
    [string]$BaseUrl,
    [string]$BrowserChannel
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$backendDirectory = Join-Path $projectRoot 'backend'
$frontendDirectory = Join-Path $projectRoot 'frontend'
$pythonPath = Join-Path $backendDirectory '.venv\Scripts\python.exe'
$previousBaseUrl = $env:PLAYWRIGHT_BASE_URL
$previousChannel = $env:PLAYWRIGHT_BROWSER_CHANNEL

function Invoke-Check([string]$Label, [scriptblock]$Command) {
    Write-Output "Running: $Label"
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "$Label failed (exit $LASTEXITCODE)." }
}

if (-not (Test-Path -LiteralPath (Join-Path $frontendDirectory 'node_modules\next\package.json'))) {
    throw 'Frontend dependencies are missing. Run npm.cmd ci in frontend first.'
}
$npmPath = (Get-Command npm.cmd -ErrorAction Stop).Source
Push-Location $projectRoot
try {
    switch ($Mode) {
        'Core' {
            if (-not (Test-Path -LiteralPath $pythonPath)) {
                throw 'Backend environment is missing. Follow README.md installation steps.'
            }
            Set-Location -LiteralPath $backendDirectory
            Invoke-Check 'pytest' { & $pythonPath -m pytest -q }
            Invoke-Check 'Ruff' { & $pythonPath -m ruff check app tests }
            Invoke-Check 'Python dependency consistency' { & $pythonPath -m pip check }
            Set-Location -LiteralPath $frontendDirectory
            Invoke-Check 'TypeScript' { & $npmPath run typecheck }
            Invoke-Check 'ESLint' { & $npmPath run lint }
        }
        'Build' {
            # Never stop a user's server just to run a build in the same checkout.
            $activeServers = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
                Where-Object {
                    $_.CommandLine -and
                    $_.CommandLine.IndexOf($frontendDirectory, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
                    $_.CommandLine -match '(start-server|next.*\s(?:dev|start)(?:\s|$))'
                })
            if ($activeServers.Count -gt 0) {
                throw 'A frontend server is active in this checkout. Stop it yourself or build in a separate checkout. No process was stopped.'
            }
            Set-Location -LiteralPath $frontendDirectory
            Invoke-Check 'Next.js production build' { & $npmPath run build }
        }
        'E2E' {
            $resolvedUrl = if ($PSBoundParameters.ContainsKey('BaseUrl')) { $BaseUrl }
                elseif ($previousBaseUrl) { $previousBaseUrl }
                else { 'http://127.0.0.1:3000' }
            $uri = $null
            if (-not [Uri]::TryCreate($resolvedUrl, [UriKind]::Absolute, [ref]$uri) -or
                $uri.Scheme -notin @('http', 'https')) {
                throw 'BaseUrl must be an absolute HTTP or HTTPS URL.'
            }
            $env:PLAYWRIGHT_BASE_URL = $resolvedUrl.TrimEnd('/')
            if ($PSBoundParameters.ContainsKey('BrowserChannel')) {
                $env:PLAYWRIGHT_BROWSER_CHANNEL = $BrowserChannel
            }
            # Verify the proxied DION engine route; this also catches an unavailable backend.
            & (Join-Path $PSScriptRoot 'check-dion-connection.ps1') -BaseUrl $env:PLAYWRIGHT_BASE_URL
            Set-Location -LiteralPath $frontendDirectory
            Invoke-Check 'Playwright against the running app' { & $npmPath run test:e2e }
        }
    }
    Write-Output "Verification complete: $Mode"
} finally {
    [Environment]::SetEnvironmentVariable('PLAYWRIGHT_BASE_URL', $previousBaseUrl, 'Process')
    [Environment]::SetEnvironmentVariable('PLAYWRIGHT_BROWSER_CHANNEL', $previousChannel, 'Process')
    Pop-Location
}
