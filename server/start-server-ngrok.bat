@echo off
title YouTube Down - Server + Ngrok
cd /d "%~dp0"

netstat -ano | findstr ":3000" >nul 2>&1
if %errorlevel% equ 0 (
  echo [*] Port 3000 in use - server already running. Starting ngrok only.
  start "" "%~dp0run-ngrok.bat"
  echo.
  echo Done. Ngrok window opened. Check it for the public URL.
) else (
  echo [1/2] Starting API server...
  start "" cmd /k "node server.js"
  timeout /t 5 /nobreak >nul
  echo [2/2] Starting ngrok...
  start "" "%~dp0run-ngrok.bat"
  echo.
  echo Done. Server: localhost:3000  -  Ngrok: check the Ngrok window for URL.
)

echo Do NOT close the Server / Ngrok windows. You can close this one.
