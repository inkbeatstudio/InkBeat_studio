@echo off
chcp 65001 >"%TEMP%\inkbeat_setup.log" 2>&1
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title InkBeat - встановлення
set "LOG=%TEMP%\inkbeat_setup.log"

echo ============================================================
echo   INKBEAT - встановлення (один раз, 5-15 хвилин)
echo ============================================================
echo.

echo "%~dp0" | findstr /i /c:"\AppData\Local\Temp\" >"%LOG%" 2>&1
if not errorlevel 1 goto :fromzip
if not exist "%~dp0app\server.py" goto :fromzip

powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath '%~dp0' -Recurse -File | Unblock-File" >"%LOG%" 2>&1

set "PY="
py -3.12 -c "import sys" >"%LOG%" 2>&1
if not errorlevel 1 set "PY=py -3.12"
if not defined PY (
  py -3.11 -c "import sys" >"%LOG%" 2>&1
  if not errorlevel 1 set "PY=py -3.11"
)
if not defined PY (
  py -3.13 -c "import sys" >"%LOG%" 2>&1
  if not errorlevel 1 set "PY=py -3.13"
)
if not defined PY (
  py -3.10 -c "import sys" >"%LOG%" 2>&1
  if not errorlevel 1 set "PY=py -3.10"
)
if not defined PY (
  python -c "import sys; sys.exit(0 if (3,10)<=sys.version_info[:2]<=(3,13) else 1)" >"%LOG%" 2>&1
  if not errorlevel 1 set "PY=python"
)
if not defined PY goto :nopython
echo Python: %PY%

if not exist ".venv\Scripts\python.exe" (
  echo Створюю окреме середовище .venv ...
  %PY% -m venv .venv
  if errorlevel 1 goto :fail
)
set "VPY=.venv\Scripts\python.exe"
"%VPY%" -m pip install --upgrade pip wheel
if errorlevel 1 goto :fail

where nvidia-smi >"%LOG%" 2>&1
if errorlevel 1 goto :cpu
echo Знайдено відеокарту NVIDIA - ставлю версію для відеокарти...
"%VPY%" -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124
if errorlevel 1 goto :fail
goto :deps
:cpu
echo Відеокарти NVIDIA не знайдено - ставлю версію для процесора...
"%VPY%" -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
if errorlevel 1 goto :fail
:deps
"%VPY%" -m pip install -r requirements.txt
if errorlevel 1 goto :fail

echo.
echo Завантажую модуль розділення (один раз, близько 80 МБ)...
"%VPY%" -c "from demucs.pretrained import get_model; get_model('htdemucs_6s'); print('OK')"

echo.
echo Створюю ярлик InkBeat на робочому столі та в меню «Пуск»...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\shortcuts.ps1" -Root "%~dp0." >>"%LOG%" 2>&1
if errorlevel 1 (echo   Ярлик створити не вдалося - запускайте через "2_ЗАПУСТИТИ (Windows).bat") else (echo   Готово: ярлик InkBeat на робочому столі.)

echo.
echo ============================================================
echo   Готово! Відкривайте InkBeat ярликом на робочому столі
echo ============================================================
pause
exit /b 0

:fromzip
echo [!] Схоже, установник запущено прямо з архіву.
echo     1. Закрийте це вікно.
echo     2. Клацніть правою кнопкою на InkBeat.zip - "Видобути все..." (або WinRAR - "Видобути в InkBeat\").
echo     3. Відкрийте розпаковану папку InkBeat і запустіть установник звідти.
pause
exit /b 1

:nopython
echo [!] Не знайдено Python 3.10-3.13.
echo     Встановіть Python 3.12 з https://www.python.org/downloads/
echo     ВАЖЛИВО: у першому вікні інсталятора поставте галочку "Add python.exe to PATH".
echo     Потім запустіть цей файл ще раз.
start "" https://www.python.org/downloads/release/python-3128/
pause
exit /b 1

:fail
echo.
echo [!] Під час встановлення сталася помилка. Перевірте інтернет і запустіть ще раз.
echo     Якщо помилка повторюється - надішліть текст вище.
pause
exit /b 1
