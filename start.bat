@echo off
setlocal enabledelayedexpansion
title S3 Desktop Explorer - MinIO Studio

echo ========================================================
echo        S3 Desktop Explorer (MinIO Studio) Launcher
echo ========================================================
echo.

:: 1. Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found in your system PATH!
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 2. Check and install dependencies
if not exist "node_modules" (
    echo [INFO] node_modules not found. Running npm install...
    call npm.cmd install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] npm install failed!
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed successfully.
    echo.
)

:: 3. Check build artifacts
if not exist "dist\index.html" (
    echo [INFO] Building frontend UI...
    call npm.cmd run build:renderer
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Frontend build failed!
        pause
        exit /b 1
    )
)

if not exist "dist-electron\main\index.js" (
    echo [INFO] Building Electron main process...
    call npm.cmd run build:electron
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Electron build failed!
        pause
        exit /b 1
    )
)

:: 4. Start Electron app in production mode
echo [INFO] Starting S3 Desktop Explorer...
set NODE_ENV=production
call npm.cmd start

if %ERRORLEVEL% neq 0 (
    echo.
    echo [INFO] Application exited with code %ERRORLEVEL%.
    pause
)