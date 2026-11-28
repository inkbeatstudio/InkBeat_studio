#!/bin/bash
set -e
source "$(dirname "$0")/payload.sh"
B="$(mktemp -d)"
P="$B/payload"
mkdir -p "$P/installer" "$OUT"
payload "$P"
cp "$REPO/installer/bootstrap.ps1" "$P/installer/"
printf '@echo off\r\nchcp 65001 >nul 2>&1\r\ncd /d "%%~dp0"\r\ntitle InkBeat - діагностика\r\necho Запуск InkBeat з журналом у цьому вікні. Не закривайте його, поки працює програма.\r\necho.\r\n"%%~dp0runtime\\python.exe" "%%~dp0run.py"\r\necho.\r\necho Програма завершила роботу. Якщо була помилка - зробіть знімок цього вікна.\r\npause\r\n' > "$P/Діагностика.bat"
WP="$(cygpath -w "$P")"
for step in python pip deps verify; do
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(cygpath -w "$P/installer/bootstrap.ps1")" -Step "$step" -Root "$WP" -Gpu cpu
done
rm -rf "$P/runtime_tmp" "$P/install.log"
rm -f "$P/runtime/installed.ok"
find "$P" -name "__pycache__" -type d -prune -exec rm -rf {} +
cd "$REPO/installer"
export LANG=C.UTF-8 LC_ALL=C.UTF-8
makensis -V2 -DAPPVER="$VER" -DOUTDIR="$(cygpath -w "$B")" -DPAYLOAD="$WP" launcher.nsi
makensis -V2 -DAPPVER="$VER" -DOUTDIR="$(cygpath -w "$B")" -DPAYLOAD="$WP" -DFULL=1 setup.nsi
cp "$B/InkBeat-Setup-$VER-Full.exe" "$OUT/InkBeat-Setup-Windows-Full.exe"
rm -rf "$B"
echo "Windows full: $OUT/InkBeat-Setup-Windows-Full.exe"
