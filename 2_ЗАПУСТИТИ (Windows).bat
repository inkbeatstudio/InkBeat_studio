@echo off
chcp 65001 >"%TEMP%\inkbeat_run.log" 2>&1
cd /d "%~dp0"
title InkBeat
if not exist ".venv\Scripts\python.exe" (
  echo Спершу запустіть "1_ВСТАНОВИТИ (Windows).bat"
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -c "import webview" >>"%TEMP%\inkbeat_run.log" 2>&1
if errorlevel 1 (
  echo Встановлюю модуль вікна програми, це один раз і недовго...
  ".venv\Scripts\python.exe" -m pip install -q "pywebview>=5.0" >>"%TEMP%\inkbeat_run.log" 2>&1
)
".venv\Scripts\python.exe" run.py %*
if errorlevel 1 pause
