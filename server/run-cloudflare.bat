@echo off
chcp 65001 >nul
title Cloudflare Tunnel
cd /d "%~dp0"

REM Node 스크립트가 cloudflared를 찾음: (1) 이 폴더 cloudflared.exe (2) winget 절대경로 (3) PATH
REM DECK 등에서 실행해도 winget 절대경로로 동작하도록
echo [Cloudflare] Starting quick tunnel to http://localhost:3000 ...
echo.
node run-cloudflare-writer.js
pause
