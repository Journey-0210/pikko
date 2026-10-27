@echo off
if exist "%~dp0run.lock" (
  echo Another collector owns the run lock. Check the existing run before starting again.
  exit /b 2
)
echo Starting BigSpy collection. Keep ego lite open.
echo Results are saved in pikko and automation\runs.
echo Live progress: automation\last-result.txt. A full run can take tens of minutes.
echo This script does not call an AI model. Independent model-token usage: 0.
node "%~dp0launch.mjs"
set "PIKKO_EXIT=%ERRORLEVEL%"
if not "%PIKKO_EXIT%"=="0" (
  echo Collection stopped. Check automation\last-run.json and the latest error report.
) else (
  echo Run ended. Check the report for complete or partial status.
)
if /I not "%~1"=="--no-pause" pause
exit /b %PIKKO_EXIT%
