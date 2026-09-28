param(
  [string]$BaseUrl = "http://localhost:8080",
  [switch]$RunExperiments
)

$ErrorActionPreference = "Stop"

function Invoke-Json($Method, $Path, $Headers = @{}, $Body = $null) {
  $params = @{
    Method = $Method
    Uri = "$BaseUrl$Path"
    Headers = $Headers
    ContentType = "application/json"
  }
  if ($null -ne $Body) { $params.Body = ($Body | ConvertTo-Json -Depth 8) }
  try {
    return Invoke-RestMethod @params
  } catch {
    throw "Request $Method $Path failed: $($_.Exception.Message)"
  }
}

Write-Host "ChaosGuard Phase 11 demo verification" -ForegroundColor Cyan
Write-Host "1/5 Checking dashboard health..."
$health = Invoke-Json "GET" "/health"
if ($health.status -ne "UP") { throw "Dashboard health is not UP." }

Write-Host "2/5 Authenticating operator..."
$email = if ($env:CHAOSGUARD_DEMO_EMAIL) { $env:CHAOSGUARD_DEMO_EMAIL } else { "operator@example.com" }
$password = if ($env:CHAOSGUARD_DEMO_PASSWORD) { $env:CHAOSGUARD_DEMO_PASSWORD } else { "operator123" }
$login = Invoke-Json "POST" "/api/auth/login" @{} @{ email = $email; password = $password }
if (-not $login.token) { throw "Login succeeded without a token." }
$headers = @{ Authorization = "Bearer $($login.token)" }

Write-Host "3/5 Verifying target discovery and monitor-only protection..."
$targetResponse = Invoke-Json "GET" "/api/servers" $headers
$targets = @($targetResponse.servers)
if ($targets.Count -lt 1) { throw "No targets were returned." }
$external = @($targets | Where-Object { $_.source -eq "external-url" })
if ($external.Count -gt 0 -and ($external | Where-Object { $_.monitorOnly -ne $true }).Count -gt 0) {
  throw "An external target was not marked monitor-only."
}

Write-Host "4/5 Verifying dashboard data and AI report shapes..."
$dashboard = Invoke-Json "GET" "/api/dashboard" $headers
if ($null -eq $dashboard.experiments) { throw "Dashboard response is missing experiments." }
foreach ($experiment in $dashboard.experiments) {
  if ($experiment.aiAnalysis -and -not $experiment.aiAnalysis.analysisSource) {
    throw "Experiment $($experiment.experimentId) has an AI report without analysisSource."
  }
}

if ($RunExperiments) {
  Write-Host "5/5 Running the destructive before/after demo (Operator only)..." -ForegroundColor Yellow
  Write-Host "Use the dashboard to start the baseline and post-fix experiments; this script does not guess a target or fault."
} else {
  Write-Host "5/5 Destructive experiment step skipped. Re-run with -RunExperiments after selecting a Compose target in the UI."
}

Write-Host "Phase 11 smoke verification passed." -ForegroundColor Green
