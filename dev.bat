@echo off
title S3 Desktop Explorer - Dev Mode

echo ========================================================
echo   S3 Desktop Explorer (MinIO Studio) - Dev Mode
echo ========================================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found in your system PATH!
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [INFO] Installing dependencies...
    call npm.cmd install
)

echo [INFO] Starting Vite dev server and Electron...
call npm.cmd run dev