@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Спочатку встановіть Node.js LTS з https://nodejs.org/
  echo Після встановлення знову відкрийте цей файл.
  pause
  exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])<20)process.exit(1)"
if errorlevel 1 (
  echo Потрібен Node.js версії 20 або новішої. Встановіть актуальний LTS.
  pause
  exit /b 1
)
echo Готово! Сторонніх залежностей немає. Запустіть start.bat.
pause
