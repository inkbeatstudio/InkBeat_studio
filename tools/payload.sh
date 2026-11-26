#!/bin/bash
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VER="$(sed -n 's/^VERSION = "\(.*\)"/\1/p' "$REPO/app/engine/project.py" | head -n 1)"
OUT="${OUT:-$REPO/dist}"
ITEMS=(app run.py requirements.txt update.json fl_scripts "ПРОЧИТАЙ МЕНЕ.txt" THIRD_PARTY_NOTICES.txt)

payload() {
  local dst="$1"
  mkdir -p "$dst"
  for it in "${ITEMS[@]}"; do
    [ -e "$REPO/$it" ] && cp -R "$REPO/$it" "$dst/"
  done
  find "$dst" -name "__pycache__" -type d -prune -exec rm -rf {} +
  find "$dst" -name "*.pyc" -delete
}
