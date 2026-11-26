# npm run local: points config.bzg at https://localhost and starts the app with cert/.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot)

# bzg run starts every package.json script at once; npm sets npm_lifecycle_event and bzg doesn't
if (-not $env:npm_lifecycle_event) { Write-Host "Skipping: start this with npm run local."; exit 0 }

function Set-ConfigValue($text, $name, $value) {
    $line = "var $name = $value;"
    if ($text -match "(?m)^var $name = .*;") { return $text -replace "(?m)^var $name = .*;", $line }
    return $text.TrimEnd() + "`r`n$line`r`n"
}

if (-not (Test-Path config.bzg)) { throw "config.bzg is missing. Copy config.example.bzg to config.bzg and fill in your keys." }
if (-not ((Test-Path cert/cert.pem) -and (Test-Path cert/key.pem))) {
    throw "cert/cert.pem or cert/key.pem is missing. See the Certificate step in docs/setup.md."
}
if (-not (Get-Command bonezegei -ErrorAction SilentlyContinue)) { throw "bonezegei isn't installed or isn't on PATH." }

$config = [IO.File]::ReadAllText("$PWD\config.bzg")
$config = Set-ConfigValue $config "useTunnel" "0"
$config = Set-ConfigValue $config "baseUrl" '"https://localhost"'
$config = Set-ConfigValue $config "googleRedirectUri" '"https://localhost/google-callback"'
$config = Set-ConfigValue $config "githubRedirectUri" '"https://localhost/github-callback"'
# No BOM: Bonezegei reads the file as plain text
[IO.File]::WriteAllText("$PWD\config.bzg", $config, (New-Object Text.UTF8Encoding $false))

Write-Host "GitHub's callback URL must be https://localhost/github-callback for this mode. Ctrl+C stops the server."
bonezegei app.bzg
