@echo off
title Ngrok
cd /d "%~dp0"
"C:\ngrok\ngrok.exe" http 3000
pause
