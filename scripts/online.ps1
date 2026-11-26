# npm run online: starts tunnel-proxy and a Cloudflare quick tunnel, points config.bzg at it and starts the app.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot)

# bzg run starts every package.json script at once; npm sets npm_lifecycle_event and bzg doesn't
if (-not $env:npm_lifecycle_event) { Write-Host "Skipping: start this with npm run online."; exit 0 }

function Set-ConfigValue($text, $name, $value) {
    $line = "var $name = $value;"
    if ($text -match "(?m)^var $name = .*;") { return $text -replace "(?m)^var $name = .*;", $line }
    return $text.TrimEnd() + "`r`n$line`r`n"
}

if (-not (Test-Path config.bzg)) { throw "config.bzg is missing. Copy config.example.bzg to config.bzg and fill in your keys." }
foreach ($tool in "cloudflared", "bonezegei", "node") {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool isn't installed or isn't on PATH." }
}

# Fixes the WebSocket header casing cloudflared sends, which http.dll rejects (see scripts/tunnel-proxy.js)
$proxy = Start-Process node -ArgumentList "scripts/tunnel-proxy.js" -WindowStyle Hidden -PassThru

$log = Join-Path $env:TEMP "jmeet-cloudflared.log"
Remove-Item $log -ErrorAction SilentlyContinue
# --config NUL skips %USERPROFILE%\.cloudflared\config.yml, whose catch-all rule 404s quick tunnels
$tunnel = Start-Process cloudflared -ArgumentList "tunnel", "--config", "NUL", "--url", "http://localhost:8001" `
    -RedirectStandardError $log -WindowStyle Hidden -PassThru

try {
    $url = $null
    for ($i = 0; $i -lt 30 -and -not $url; $i++) {
        Start-Sleep 1
        if (Test-Path $log) {
            $match = Select-String -Path $log -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -First 1
            if ($match) { $url = $match.Matches[0].Value }
        }
        if ($tunnel.HasExited) { throw "cloudflared stopped. Its log is in $log" }
        if ($proxy.HasExited) { throw "tunnel-proxy stopped. Is port 8001 already in use?" }
    }
    if (-not $url) { throw "No tunnel address after 30 seconds. Check your connection and try again." }

    $config = [IO.File]::ReadAllText("$PWD\config.bzg")
    $config = Set-ConfigValue $config "useTunnel" "1"
    $config = Set-ConfigValue $config "tunnelPort" "8002"
    $config = Set-ConfigValue $config "baseUrl" "`"$url`""
    $config = Set-ConfigValue $config "googleRedirectUri" "`"$url/google-callback`""
    $config = Set-ConfigValue $config "githubRedirectUri" "`"$url/github-callback`""
    # No BOM: Bonezegei reads the file as plain text
    [IO.File]::WriteAllText("$PWD\config.bzg", $config, (New-Object Text.UTF8Encoding $false))

    Set-Clipboard $url
    Write-Host ""
    Write-Host "  Share this address (copied): $url"
    Write-Host "  Add to Google redirect URIs:  $url/google-callback"
    Write-Host "  Set GitHub callback URL to:   $url/github-callback"
    Write-Host "  It can take a minute to start working. Ctrl+C stops everything."
    Write-Host ""

    bonezegei app.bzg
} finally {
    foreach ($child in $tunnel, $proxy) {
        if (-not $child.HasExited) { Stop-Process -Id $child.Id -Force }
    }
}
