@echo off
setlocal enabledelayedexpansion
title Barber Shop Sales
color 0A

echo.
echo  ============================================
echo    Barber Shop Sales - Starting up...
echo  ============================================
echo.

REM -----------------------------------------------
REM  1. Check if Node.js is installed
REM -----------------------------------------------
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  Node.js is not installed. Downloading now...
    echo  This only happens once. Please wait...
    echo.
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi' -OutFile '%temp%\node_setup.msi' -UseBasicParsing"
    echo  Installing Node.js silently...
    msiexec /i "%temp%\node_setup.msi" /qn /norestart
    del "%temp%\node_setup.msi" >nul 2>nul

    REM Reload system PATH so node is available immediately
    for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
    set "PATH=!SYS_PATH!;C:\Program Files\nodejs"

    echo  Node.js installed successfully!
    echo.
)

REM -----------------------------------------------
REM  2. Install npm dependencies if missing
REM -----------------------------------------------
if not exist "node_modules" (
    echo  Installing app dependencies. Please wait...
    call npm install
    if !errorlevel! neq 0 (
        echo.
        echo  ERROR: Failed to install dependencies.
        echo  Please check your internet connection and try again.
        echo.
        pause
        exit /b 1
    )
    echo  Dependencies installed!
    echo.
)

REM -----------------------------------------------
REM  3. Free port 3000 if something is using it
REM -----------------------------------------------
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000 "') do (
    taskkill /f /pid %%a >nul 2>nul
)

REM -----------------------------------------------
REM  4. Open browser after 2s delay (background)
REM -----------------------------------------------
start /B cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"

REM -----------------------------------------------
REM  5. Run the server (foreground — closing this
REM     window will stop the app)
REM -----------------------------------------------
echo  App is running! Opening browser...
echo.
echo  ============================================
echo    URL: http://localhost:3000
echo    Keep this window open while using the app.
echo    Close this window to stop the app.
echo  ============================================
echo.
node server.js
