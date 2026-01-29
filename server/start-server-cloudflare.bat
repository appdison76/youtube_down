@echo off
chcp 65001 >nul
title YouTube Down - Server (Cloudflare Tunnel)
cd /d "%~dp0"

REM Kill process on port 3000 if in use
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
  echo [*] Port 3000 in use - killing process...
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /PID %%a /F 2>nul
  timeout /t 2 /nobreak >nul
)

echo.
echo ========================================
echo   YouTube Down - melodysnap.mediacommercelab.com
echo ========================================
echo   Check: cloudflared service running (services.msc)
echo ========================================
echo.
start "" cmd /k "cd /d %~dp0 && node server_local.js"
echo.
echo Server started. URL: https://melodysnap.mediacommercelab.com
echo Do NOT close the server window.
echo.
echo [You can close THIS window. Server runs in the other window.]
pause
