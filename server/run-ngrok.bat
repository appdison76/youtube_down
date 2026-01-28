@echo off
title Ngrok
cd /d "%~dp0"

REM NGROK_DOMAIN 환경 변수가 설정되어 있으면 고정 도메인 사용 (유료 버전)
if defined NGROK_DOMAIN (
  echo [Ngrok] Using static domain: %NGROK_DOMAIN%
  "C:\ngrok\ngrok.exe" http 3000 --domain=%NGROK_DOMAIN%
) else (
  echo [Ngrok] Using free version (dynamic URL)
  "C:\ngrok\ngrok.exe" http 3000
)
pause
