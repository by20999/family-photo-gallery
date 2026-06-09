param(
    [int]$Port = 3000,
    [string]$AdminPassword = "by-2099",
    [switch]$Menu,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

function Assert-Command($name, $installHint) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "$name was not found. $installHint"
    }
}

function Test-PortAvailable($candidatePort) {
    $listener = $null
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $candidatePort)
        $listener.Start()
        return $true
    } catch {
        return $false
    } finally {
        if ($listener) {
            $listener.Stop()
        }
    }
}

function Resolve-FreePort($preferredPort) {
    for ($candidate = $preferredPort; $candidate -lt ($preferredPort + 30); $candidate++) {
        if (Test-PortAvailable $candidate) {
            return $candidate
        }
    }
    throw "No available local port found from $preferredPort to $($preferredPort + 29)."
}

Write-Host "Family Photo Gallery local starter" -ForegroundColor Cyan
Write-Host "Project: $projectRoot"

Assert-Command "node" "Install Node.js LTS from https://nodejs.org/ and try again."
Assert-Command "npm" "Install Node.js LTS from https://nodejs.org/ and try again."

if (-not (Test-Path (Join-Path $projectRoot "node_modules"))) {
    Write-Host "node_modules not found. Running npm install..." -ForegroundColor Yellow
    npm install
}

function Show-Menu {
    Write-Host ""
    Write-Host "Local control panel" -ForegroundColor Cyan
    Write-Host "1. Start website"
    Write-Host "2. Check data health"
    Write-Host "3. Open uploads folder"
    Write-Host "4. Show admin password"
    Write-Host "0. Exit"
    Write-Host ""
}

if ($Menu) {
    while ($true) {
        Show-Menu
        $choice = Read-Host "Choose"
        if ($choice -eq "1") { break }
        if ($choice -eq "2") {
            npm run audit:data
            continue
        }
        if ($choice -eq "3") {
            Start-Process (Join-Path $projectRoot "uploads")
            continue
        }
        if ($choice -eq "4") {
            $passwordToShow = if ($env:DELETE_PASSWORD) { $env:DELETE_PASSWORD } else { $AdminPassword }
            Write-Host "Admin password for write actions: $passwordToShow" -ForegroundColor Green
            continue
        }
        if ($choice -eq "0") {
            exit 0
        }
        Write-Host "Unknown option." -ForegroundColor Yellow
    }
}

$resolvedPort = Resolve-FreePort $Port
if ($resolvedPort -ne $Port) {
    Write-Host "Port $Port is busy. Using port $resolvedPort instead." -ForegroundColor Yellow
}

$env:PORT = [string]$resolvedPort
if (-not $env:DELETE_PASSWORD) {
    $env:DELETE_PASSWORD = $AdminPassword
}

$url = "http://localhost:$resolvedPort"

Write-Host ""
Write-Host "Local URL: $url" -ForegroundColor Green
Write-Host "Admin password for write actions: $env:DELETE_PASSWORD" -ForegroundColor Green
Write-Host "Press Ctrl+C in this window to stop the server." -ForegroundColor Yellow
Write-Host ""

if (-not $NoBrowser) {
    Start-Process $url
}

npm start
