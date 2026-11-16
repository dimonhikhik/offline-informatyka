@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Спочатку відкрийте install.bat.
  pause
  exit /b 1
)
node local-server/server.mjs --lan
pause
