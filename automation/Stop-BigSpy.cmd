@echo off
type nul > "%~dp0stop-requested"
echo Stop requested. The collector will finish its current operation and preserve downloaded files.
if /I not "%~1"=="--no-pause" pause
