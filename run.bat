@echo off
title Genesis ^& Cosmos — God Simulator
color 0b

echo ===================================================
echo     GENESIS ^& COSMOS — GOD SIMULATOR
echo ===================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found on your system!
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

cd /d "%~dp0"

if not exist "node_modules" (
    echo [INFO] Installing required dependencies...
    call npm.cmd install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
)

echo [INFO] Launching Genesis ^& Cosmos...
echo Opening game in your default browser at http://127.0.0.1:5173/
echo.

start "" "http://127.0.0.1:5173/"

call npm.cmd run dev -- --host 127.0.0.1 --port 5173

if %errorlevel% neq 0 (
    pause
)
