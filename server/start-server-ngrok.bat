@echo off
title YouTube Down - Server + Ngrok
cd /d "%~dp0"

REM ============================================
REM 유료 버전 사용 시: 아래 NGROK_DOMAIN 값을 설정하세요
REM 예: set NGROK_DOMAIN=yourname.ngrok-free.app
REM 무료 버전 사용 시: 이 줄을 주석 처리하거나 비워두세요
REM ============================================
REM set NGROK_DOMAIN=yourname.ngrok-free.app

REM 3000 사용 중이면 해당 프로세스 종료 후 서버+ngrok 띄움
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
  echo [*] Port 3000 in use - killing process...
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /PID %%a /F 2>nul
  timeout /t 2 /nobreak >nul
)

echo [1/2] Starting API server...
start "" cmd /k "cd /d %~dp0 && node server_local.js"
timeout /t 5 /nobreak >nul
echo [2/2] Starting ngrok...
start "" "%~dp0run-ngrok.bat"
echo.
echo Done. Server: localhost:3000  -  Ngrok: check the Ngrok window for URL.

echo Do NOT close the Server / Ngrok windows. You can close this one.
