@echo off
title YouTube Down - Server + Cloudflare Tunnel
cd /d "%~dp0"

REM 3000 사용 중이면 해당 프로세스 종료 후 서버+터널 띄움
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
  echo [*] Port 3000 in use - killing process...
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /PID %%a /F 2>nul
  timeout /t 2 /nobreak >nul
)

echo [1/2] Starting API server...
start "" cmd /k "cd /d %~dp0 && node server_local.js"
timeout /t 5 /nobreak >nul
echo [2/2] Starting Cloudflare Tunnel...
start "" "%~dp0run-cloudflare.bat"
echo.
echo Done. Server: localhost:3000  -  Tunnel URL: check Cloudflare window or http://localhost:3000/api/tunnel-url
echo Do NOT close the Server / Cloudflare windows. You can close this one.
