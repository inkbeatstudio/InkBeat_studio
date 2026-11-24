@echo off
chcp 65001 >"%TEMP%\inkbeat_run.log" 2>&1
cd /d "%~dp0"
title InkBeat
if not exist ".venv\Scripts\python.exe" (
  echo Спершу запустіть "1_ВСТАНОВИТИ (Windows).bat"
  pause
  exit /b 1
)
".venv\Scripts\python.exe" run.py %*
if errorlevel 1 pause
