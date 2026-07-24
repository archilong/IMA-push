param(
  [int]$Port = 39387,
  [int]$ServiceStartupTimeoutSec = 30,
  [int]$CpolarStartupTimeoutSec = 90
)

$ErrorActionPreference = "Stop"
$CpolarRoot = $PSScriptRoot
$ServiceRoot = Split-Path -Parent $CpolarRoot
$StatePath = Join-Path $CpolarRoot "public-webhook.json"
$OutLogPath = Join-Path $CpolarRoot "cpolar-current.out.log"
$ErrLogPath = Join-Path $CpolarRoot "cpolar-current.err.log"

function Write-Section {
  param([string]$Title)
  Write-Host ""
  Write-Host "==== $Title ===="
}

function Test-LocalService {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300)
  } catch {
    return $false
  }
}

function Ensure-LocalService {
  Write-Section "Local IMA service"
  if (Test-LocalService) {
    Write-Host "READY: http://127.0.0.1:$Port"
    return
  }

  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCommand) {
    throw "Node.js was not found in PATH."
  }

  $serverPath = Join-Path $ServiceRoot "src\server.js"
  if (-not (Test-Path -LiteralPath $serverPath)) {
    throw "IMA server entry was not found: $serverPath"
  }

  Write-Host "Starting IMA service on port $Port..."
  Start-Process -FilePath $nodeCommand.Source -ArgumentList "src/server.js" -WorkingDirectory $ServiceRoot -WindowStyle Hidden

  $deadline = (Get-Date).AddSeconds([Math]::Max(5, $ServiceStartupTimeoutSec))
  do {
    if (Test-LocalService) {
      Write-Host "READY: http://127.0.0.1:$Port"
      return
    }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)

  throw "IMA service did not become ready on port $Port."
}

function Test-PublicImaBaseUrl {
  param([string]$BaseUrl)

  if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
    return $false
  }

  $url = $BaseUrl.TrimEnd("/") + "/health"
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 8
    if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
      return $false
    }
  } catch {
    return $false
  }

  try {
    $page = Invoke-WebRequest -UseBasicParsing -Uri ($BaseUrl.TrimEnd("/") + "/") -TimeoutSec 8
    $content = [string]$page.Content
    return ($page.StatusCode -ge 200 -and $page.StatusCode -lt 300 -and $content.Contains("IMA 传输工作流") -and $content.Contains("IMA数据推送"))
  } catch {
    return $false
  }
}

function Add-UrlIfValid {
  param(
    [System.Collections.Generic.List[string]]$Urls,
    [string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return
  }
  $clean = $Value.Trim().TrimEnd([char[]]@("\", "/"))
  if ($clean -match '^https?://[^/\s"]+\.cpolar\.(top|cn)$' -and -not $Urls.Contains($clean)) {
    $Urls.Add($clean)
  }
}

function Get-CpolarPublicUrls {
  $urls = [System.Collections.Generic.List[string]]::new()
  $contents = [System.Collections.Generic.List[string]]::new()

  foreach ($apiUrl in "http://127.0.0.1:4040/api/tunnels", "http://127.0.0.1:4040", "http://127.0.0.1:4041", "http://127.0.0.1:4042", "http://127.0.0.1:9200") {
    try {
      $content = (Invoke-WebRequest -UseBasicParsing -Uri $apiUrl -TimeoutSec 3).Content
      if ($content -is [byte[]]) {
        $content = [System.Text.Encoding]::UTF8.GetString($content)
      }
      $contents.Add([string]$content)
    } catch {}
  }

  foreach ($logPath in $OutLogPath, $ErrLogPath) {
    if (Test-Path -LiteralPath $logPath) {
      $contents.Add([string](Get-Content -LiteralPath $logPath -Raw -ErrorAction SilentlyContinue))
    }
  }

  foreach ($content in $contents) {
    foreach ($match in [regex]::Matches([string]$content, "https?://[^`"'<>\s\\]+")) {
      Add-UrlIfValid -Urls $urls -Value $match.Value
    }
  }

  return @($urls | Sort-Object @{ Expression = { if ($_ -like "https://*") { 0 } else { 1 } } }, @{ Expression = { $_ } })
}

function Stop-ExistingCpolarHttpTunnels {
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -ieq "cpolar.exe" -and
      $_.CommandLine -match "\bhttp\s+\d+"
    } |
    ForEach-Object {
      try {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      } catch {}
    }
}

function Start-CpolarTunnel {
  Write-Section "cpolar tunnel"
  $cpolarCommand = Get-Command cpolar -ErrorAction SilentlyContinue
  if (-not $cpolarCommand) {
    throw "cpolar was not found in PATH."
  }

  foreach ($url in Get-CpolarPublicUrls) {
    if (Test-PublicImaBaseUrl $url) {
      Write-Host "Reusing existing cpolar tunnel."
      return $url
    }
  }

  Stop-ExistingCpolarHttpTunnels
  Start-Sleep -Milliseconds 600
  Remove-Item -LiteralPath $OutLogPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $ErrLogPath -Force -ErrorAction SilentlyContinue

  Write-Host "Starting cpolar: http $Port"
  Start-Process -FilePath $cpolarCommand.Source -ArgumentList @("http", [string]$Port, "--log=stdout") -WorkingDirectory $CpolarRoot -RedirectStandardOutput $OutLogPath -RedirectStandardError $ErrLogPath -WindowStyle Hidden

  $deadline = (Get-Date).AddSeconds([Math]::Max(30, $CpolarStartupTimeoutSec))
  do {
    foreach ($url in Get-CpolarPublicUrls) {
      if (Test-PublicImaBaseUrl $url) {
        return $url
      }
    }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)

  throw "cpolar started but no reachable public URL was detected. Logs: $OutLogPath ; $ErrLogPath"
}

function Save-PublicWebhookState {
  param([string]$BaseUrl)

  $cleanBaseUrl = $BaseUrl.TrimEnd("/")
  [ordered]@{
    baseUrl = $cleanBaseUrl
    webhookUrl = "$cleanBaseUrl/webhook"
    localUrl = "http://127.0.0.1:$Port"
    localWebhookUrl = "http://127.0.0.1:$Port/webhook"
    port = $Port
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $StatePath -Encoding UTF8
}

Ensure-LocalService
$publicBaseUrl = Start-CpolarTunnel
Save-PublicWebhookState -BaseUrl $publicBaseUrl

Write-Section "Public address"
Write-Host "PUBLIC_BASE_URL=$($publicBaseUrl.TrimEnd('/'))"
Write-Host "PUBLIC_WEBHOOK_URL=$($publicBaseUrl.TrimEnd('/'))/webhook" -ForegroundColor Green
Write-Host ""
Write-Host "Use PUBLIC_WEBHOOK_URL as the Officebook webhook callback address."
