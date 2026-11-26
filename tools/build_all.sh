#!/bin/bash
set -e
D="$(dirname "$0")"
python3 "$D/make_update_zip.py"
bash "$D/build_linux.sh"
bash "$D/build_macos.sh"
if command -v makensis >/dev/null 2>&1; then bash "$D/build_windows.sh"; else echo "makensis не знайдено — інсталятор Windows пропущено"; fi
