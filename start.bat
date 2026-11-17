@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
if not exist "local-server\server.mjs" (
  echo Не знайдено файли програми.
  echo Розпакуйте весь ZIP-архів через «Видобути все» та відкрийте цей файл у розпакованій папці.
  pause
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo Не знайдено Node.js. Встановіть актуальний LTS з https://nodejs.org/
  pause
  exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])<20)process.exit(1)"
if errorlevel 1 (
  echo Потрібен Node.js 20 або новіший. Встановіть актуальний LTS з https://nodejs.org/
  echo Поточна версія Node.js
  node --version
  pause
  exit /b 1
)
node local-server/server.mjs
set "server_exit=%errorlevel%"
if not "%server_exit%"=="0" (
  echo.
  echo Сервер не запущено. Причину наведено вище.
)
pause
exit /b %server_exit%
