@echo off
chcp 65001 >nul
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install it, then open this file again.
  echo Download: https://nodejs.org/en/download
  pause
  exit /b 1
)
node "%~dp0automation\welcome.mjs"
set "PIKKO_EXIT=%ERRORLEVEL%"
if not "%PIKKO_EXIT%"=="0" echo Setup has not finished. Your requirements and existing data are preserved.
pause
exit /b %PIKKO_EXIT%
