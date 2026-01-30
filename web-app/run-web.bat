@echo off
echo.
echo  run-web.bat starting...
cd /d "%~dp0."
if errorlevel 1 (
  echo  ERROR: cd failed.
  goto :end
)
if not exist "index.html" (
  echo  ERROR: index.html not found in: %cd%
  goto :end
)

title Melody Snap - Web App (localhost:8000)
echo.
echo  Melody Snap Web App
echo  Open http://localhost:8000 in your browser
echo  Press Ctrl+C to stop
echo.

echo  Freeing port 8000 if in use...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 0 } | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" 2>nul
timeout /t 2 /nobreak >nul

REM npx -> node serve-8000 -> python
where npx >nul 2>nul
if not errorlevel 1 (
  echo  npx http-server ...
  call npx http-server -p 8000 -a 0.0.0.0
  goto :end
)
where node >nul 2>nul
if not errorlevel 1 (
  echo  node serve-8000.js ...
  call node serve-8000.js
  goto :end
)
echo  python http.server ...
call python -m http.server 8000

:end
echo.
echo  Press any key to close.
pause >nul
