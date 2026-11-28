@echo off
chcp 65001 >"%TEMP%\inkbeat_lnk.log" 2>&1
cd /d "%~dp0"
title InkBeat - ярлик
if not exist ".venv\Scripts\pythonw.exe" (
  echo Спершу запустіть "1_ВСТАНОВИТИ (Windows).bat"
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -c "import webview" >>"%TEMP%\inkbeat_run.log" 2>&1
if errorlevel 1 (
  echo Встановлюю модуль вікна програми, це один раз і недовго...
  ".venv\Scripts\python.exe" -m pip install -q "pywebview>=5.0" >>"%TEMP%\inkbeat_run.log" 2>&1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\shortcuts.ps1" -Root "%~dp0." >>"%TEMP%\inkbeat_lnk.log" 2>&1
if errorlevel 1 (
  echo Не вдалося створити ярлик. Подробиці: %TEMP%\inkbeat_lnk.log
) else (
  echo Готово! На робочому столі та в меню «Пуск» з'явився ярлик InkBeat.
  echo Програма відкривається без чорного вікна і сама закривається, коли ви закриєте її вікно.
)
pause
