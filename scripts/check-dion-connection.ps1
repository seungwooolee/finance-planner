[CmdletBinding()]
param([Parameter(Mandatory)][string]$BaseUrl)

$ErrorActionPreference = 'Stop'
$fixturePath = Join-Path (Split-Path -Parent $PSScriptRoot) 'frontend/src/lib/dion/fictional-example.json'
$endpoint = "$($BaseUrl.TrimEnd('/'))/api/fe/v1/preview"
try {
    # Public, stateless preview only. Never save the fictional case or request authentication.
    $response = Invoke-RestMethod -Uri $endpoint -Method Post -ContentType 'application/json; charset=utf-8' `
        -Body ([System.IO.File]::ReadAllBytes($fixturePath)) -TimeoutSec 20
} catch {
    throw "DION preview is unavailable at $endpoint. Start app.be_server:app and check BACKEND_URL (default port 8001). $($_.Exception.Message)"
}
if ($response.integration_version -ne 'DION-FE-INTEGRATION-1.0' -or $response.storage -ne 'NOT_SAVED' -or
    $response.result.calc_state -notin @('CALCULATED', 'PARTIAL') -or
    $response.result.results.'OUT-03'.normalized_living.value -cne '1600000' -or
    $response.result.results.'OUT-03'.after_existing_contributions_krw -cne '900000') {
    throw "DION preview contract or fictional-case amounts do not match at $endpoint. Check the running application and engine version."
}
Write-Output "DION input -> engine -> output verified: $endpoint (fictional preview, NOT_SAVED)."
