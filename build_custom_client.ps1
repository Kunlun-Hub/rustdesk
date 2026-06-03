param(
    [Parameter(Mandatory = $true)]
    [string]$IdServer,

    [Parameter(Mandatory = $true)]
    [string]$ApiServer,

    [Parameter(Mandatory = $true)]
    [string]$Key,

    [string]$RelayServer = "",
    [string]$RelayApiUrl = "",

    [switch]$Flutter = $true,
    [switch]$Hwcodec = $true,
    [switch]$Vram = $true,
    [switch]$Portable = $true,
    [switch]$SkipPortablePack = $true,
    [switch]$SkipCargo = $false
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

if ([string]::IsNullOrWhiteSpace($RelayApiUrl)) {
    $RelayApiUrl = ($ApiServer.TrimEnd('/')) + "/relay/list.json"
}

if ($SkipCargo) {
    throw "Custom client server settings require rebuilding the Rust core. Remove -SkipCargo and run again."
}

$args = @(".\build.py")

if ($Portable) {
    $args += "--portable"
}
if ($Flutter) {
    $args += "--flutter"
}
if ($Hwcodec) {
    $args += "--hwcodec"
}
if ($Vram) {
    $args += "--vram"
}
if ($SkipPortablePack) {
    $args += "--skip-portable-pack"
}
if ($SkipCargo) {
    $args += "--skip-cargo"
}

$args += @(
    "--id-server", $IdServer,
    "--api-server", $ApiServer,
    "--key", $Key,
    "--relay-api-url", $RelayApiUrl
)

if (-not [string]::IsNullOrWhiteSpace($RelayServer)) {
    $args += @("--relay-server", $RelayServer)
}

Write-Host "Building custom client with:"
Write-Host "  id-server:     $IdServer"
Write-Host "  api-server:    $ApiServer"
Write-Host "  relay-api-url: $RelayApiUrl"
if (-not [string]::IsNullOrWhiteSpace($RelayServer)) {
    Write-Host "  relay-server:  $RelayServer (fallback)"
}

& python @args

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
