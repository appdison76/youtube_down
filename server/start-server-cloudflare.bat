@echo off
chcp 65001 >nul
title YouTube Down - Server (Cloudflare Tunnel)
cd /d "%~dp0"

REM 3000 사용 중이면 해당 프로세스 종료
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
echo   접속 전 확인: services.msc 에서 cloudflared "시작됨"
echo ========================================
echo.
start "" cmd /k "cd /d %~dp0 && node server_local.js"
echo.
echo 서버 실행됨. 접속: https://melodysnap.mediacommercelab.com
echo 서버 창 닫지 마세요.
exit
