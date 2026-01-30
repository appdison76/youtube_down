@echo off
if not "%~1"=="_run" (
  cmd /k "%~f0" _run
  exit /b
)

title Melody Snap - Web App (localhost:8000)
cd /d "%~dp0"

echo.
echo  [*] Melody Snap Web App
echo  [*] Open http://localhost:8000 in your browser
echo  [*] Press Ctrl+C to stop
echo.

echo  Freeing port 8000 if in use...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 0 } | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
timeout /t 2 /nobreak >nul

REM 8000에서 웹앱(/) + install-page(/install-page/) 서빙. -a 0.0.0.0 으로 폰/같은 Wi-Fi 접속 가능
where npx >nul 2>nul
if %errorlevel% equ 0 (
  npx http-server -p 8000 -a 0.0.0.0
) else (
  python -m http.server 8000
)

echo.
pause
