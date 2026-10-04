# Genesis & Cosmos — PowerShell Runner
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "    GENESIS & COSMOS — GOD SIMULATOR" -ForegroundColor Yellow
Write-Host "===================================================" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/"
    Read-Host "Press Enter to exit..."
    exit 1
}

if (-not (Test-Path "$scriptDir\node_modules")) {
    Write-Host "[INFO] Installing required dependencies..." -ForegroundColor Green
    & npm.cmd install
}

Write-Host "[INFO] Opening game at http://127.0.0.1:5173/..." -ForegroundColor Green
Start-Process "http://127.0.0.1:5173/"

Write-Host "[INFO] Launching Vite development server..." -ForegroundColor Green
& npm.cmd run dev -- --host 127.0.0.1 --port 5173
