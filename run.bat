@echo off
setlocal enabledelayedexpansion
title ChatPPT Startup Launcher
color 05
chcp 65001 >nul

cls
if exist logo.txt (
    type logo.txt
) else (
    echo ChatPPT - presentation builder
)
echo.

echo Checking for Node.js engine...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    color 0c
    echo [ERROR] Node.js is not found on your system PATH!
    echo Please download and install Node.js from https://nodejs.org/ to run ChatPPT.
    pause
    exit /b 1
)

echo.
echo [STATUS] Checking workspace status...

if exist node_modules (
    echo [INFO] Node packages are already present. Skipping installation step...
) else (
    echo [INFO] node_modules not found. Restoring workspace packages...
    echo This may take a few moments. Please keep this console open...
    call npm install
)

echo.
echo Starting ChatPPT (npm run dev)...
echo ===================================================
echo.
call npm run dev
