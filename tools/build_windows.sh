#!/bin/bash
set -e
source "$(dirname "$0")/payload.sh"
B="$(mktemp -d)"
mkdir -p "$B/payload/installer" "$OUT"
payload "$B/payload"
cp "$REPO/installer/bootstrap.ps1" "$B/payload/installer/"
printf '@echo off\r\nchcp 65001 >nul 2>&1\r\ncd /d "%%~dp0"\r\ntitle InkBeat - діагностика\r\necho Запуск InkBeat з журналом у цьому вікні. Не закривайте його, поки працює програма.\r\necho.\r\n"%%~dp0runtime\\python.exe" "%%~dp0run.py"\r\necho.\r\necho Програма завершила роботу. Якщо була помилка - зробіть знімок цього вікна.\r\npause\r\n' > "$B/payload/Діагностика.bat"
cd "$REPO/installer"
export LANG=C.UTF-8 LC_ALL=C.UTF-8
makensis -V2 -DAPPVER="$VER" -DOUTDIR="$B" -DPAYLOAD="$B/payload" launcher.nsi
makensis -V2 -DAPPVER="$VER" -DOUTDIR="$B" -DPAYLOAD="$B/payload" setup.nsi
cp "$B/InkBeat-Setup-$VER.exe" "$OUT/InkBeat-Setup-Windows.exe"
rm -rf "$B"
echo "Windows: $OUT/InkBeat-Setup-Windows.exe"
