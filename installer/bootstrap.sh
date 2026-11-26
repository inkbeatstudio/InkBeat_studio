#!/bin/bash
set -u

SRC="$(cd "$(dirname "$0")/.." && pwd)"
OS="$(uname -s)"
ARCH="$(uname -m)"
PYVER="3.11.10"
PBS="20241016"
TORCH="2.6.0"
GPU="${INKBEAT_GPU:-auto}"

if [ "$OS" = "Darwin" ]; then
  DEST="${INKBEAT_HOME:-$HOME/Library/Application Support/InkBeat}"
else
  DEST="${INKBEAT_HOME:-$HOME/.local/share/InkBeat}"
fi
RT="$DEST/runtime"
PY="$RT/bin/python3"
LOG="$DEST/install.log"

B="$(printf '\033[1m')"; A="$(printf '\033[38;5;214m')"; G="$(printf '\033[38;5;79m')"; R="$(printf '\033[38;5;203m')"; D="$(printf '\033[2m')"; N="$(printf '\033[0m')"

say()  { printf "%s\n" "$*"; printf "%s\n" "$*" >> "$LOG" 2>/dev/null; }
step() { printf "\n${A}${B}[%s/%s]${N} ${B}%s${N}\n" "$1" "$2" "$3"; printf "\n=== %s/%s %s %s\n" "$1" "$2" "$3" "$(date)" >> "$LOG" 2>/dev/null; }
ok()   { printf "  ${G}✓${N} %s\n" "$*"; printf "ok: %s\n" "$*" >> "$LOG" 2>/dev/null; }
die()  {
  printf "\n  ${R}${B}✗ %s${N}\n" "$*"
  printf "ERROR: %s\n" "$*" >> "$LOG" 2>/dev/null
  printf "\n  Журнал встановлення: ${B}%s${N}\n  Запустіть інсталятор ще раз — він продовжить з цього місця.\n\n" "$LOG"
  exit 1
}
run()  { "$@" >> "$LOG" 2>&1; }

banner() {
  printf "\n${A}${B}  ▌▐▐ ☰  INKBEAT${N}\n  ${D}Встановлення версії %s · %s %s${N}\n" "$(app_version "$SRC")" "$OS" "$ARCH"
  printf "  ${D}Папка програми: %s${N}\n" "$DEST"
}

app_version() {
  sed -n 's/^VERSION = "\(.*\)"/\1/p' "$1/app/engine/project.py" 2>/dev/null | head -n 1
}

need_net() {
  curl -fsI --max-time 15 https://pypi.org/simple/ >/dev/null 2>&1 || die "Немає з'єднання з інтернетом. Для встановлення потрібен інтернет (≈0,6–3 ГБ)."
}

copy_app() {
  mkdir -p "$DEST"
  if [ "$SRC" != "$DEST" ]; then
    for item in app run.py requirements.txt update.json fl_scripts installer "ПРОЧИТАЙ МЕНЕ.txt" THIRD_PARTY_NOTICES.txt; do
      if [ -e "$SRC/$item" ]; then
        rm -rf "$DEST/$item"
        cp -R "$SRC/$item" "$DEST/$item" || die "Не вдалося скопіювати файли програми в $DEST"
      fi
    done
  fi
  find "$DEST" -name "__pycache__" -type d -prune -exec rm -rf {} + 2>/dev/null
  ok "Файли програми скопійовано"
}

get_python() {
  if [ -x "$PY" ] && "$PY" -c "import sys; assert sys.version_info[:2] == (3, 11)" >/dev/null 2>&1; then
    ok "Середовище Python вже є"
    return
  fi
  case "$OS-$ARCH" in
    Darwin-arm64) TRIPLE="aarch64-apple-darwin" ;;
    Darwin-x86_64) TRIPLE="x86_64-apple-darwin" ;;
    Linux-x86_64) TRIPLE="x86_64-unknown-linux-gnu" ;;
    Linux-aarch64|Linux-arm64) TRIPLE="aarch64-unknown-linux-gnu" ;;
    *) die "Ця система не підтримується: $OS $ARCH" ;;
  esac
  URL="https://github.com/astral-sh/python-build-standalone/releases/download/${PBS}/cpython-${PYVER}%2B${PBS}-${TRIPLE}-install_only.tar.gz"
  TMP="$DEST/python.tar.gz"
  say "  Завантажую середовище (≈30 МБ)…"
  curl -fL --retry 5 --retry-delay 3 --progress-bar -o "$TMP" "$URL" || die "Не вдалося завантажити середовище Python."
  rm -rf "$RT" "$DEST/python"
  tar -xzf "$TMP" -C "$DEST" || die "Не вдалося розпакувати середовище Python."
  mv "$DEST/python" "$RT"
  rm -f "$TMP"
  "$PY" -c "import ssl, sqlite3" >/dev/null 2>&1 || die "Середовище Python пошкоджене."
  ok "Python $("$PY" -c 'import platform; print(platform.python_version())')"
}

pip_i() {
  PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_DEFAULT_TIMEOUT=120 PIP_RETRIES=10 PIP_NO_CACHE_DIR=1 \
    "$PY" -m pip install --no-warn-script-location "$@" >> "$LOG" 2>&1
}

get_pip() {
  pip_i --upgrade pip setuptools wheel || die "Не вдалося оновити встановлювач пакетів."
  ok "Встановлювач пакетів готовий"
}

has_nvidia() {
  [ "$GPU" = "cpu" ] && return 1
  command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1
}

get_torch() {
  if [ "$OS" = "Darwin" ]; then
    if [ "$ARCH" = "x86_64" ]; then
      SPEC="torch==2.2.2 torchaudio==2.2.2 numpy<2"
    else
      SPEC="torch==$TORCH torchaudio==$TORCH"
    fi
    if "$PY" -c "import torch, torchaudio" >/dev/null 2>&1; then ok "Обчислювальний рушій вже є"; return; fi
    say "  Завантажую обчислювальний рушій (≈300 МБ). Це найдовший крок…"
    pip_i $SPEC || die "Не вдалося завантажити обчислювальний рушій."
    ok "Рушій встановлено (на Apple Silicon розбір іде на відеокарті Mac)"
    return
  fi
  if has_nvidia; then
    WANT=1
  else
    WANT=0
  fi
  if "$PY" -c "import sys, torch, torchaudio; sys.exit(0 if (torch.version.cuda or not $WANT) else 3)" >/dev/null 2>&1; then
    ok "Обчислювальний рушій вже є"
    return
  fi
  if [ "$WANT" = "1" ] && [ "$ARCH" = "x86_64" ]; then
    say "  Знайдено відеокарту NVIDIA — завантажую версію з прискоренням (≈2,5 ГБ). Це найдовший крок…"
    if pip_i "torch==$TORCH+cu124" "torchaudio==$TORCH+cu124" --index-url https://download.pytorch.org/whl/cu124; then
      ok "Рушій з прискоренням відеокартою встановлено"
      return
    fi
    say "  Версія для відеокарти не завантажилась — ставлю версію для процесора."
  fi
  say "  Завантажую обчислювальний рушій (≈200 МБ)…"
  if [ "$ARCH" = "x86_64" ]; then
    pip_i "torch==$TORCH+cpu" "torchaudio==$TORCH+cpu" --index-url https://download.pytorch.org/whl/cpu || die "Не вдалося завантажити обчислювальний рушій."
  else
    pip_i "torch==$TORCH" "torchaudio==$TORCH" || die "Не вдалося завантажити обчислювальний рушій."
  fi
  ok "Рушій встановлено"
}

get_deps() {
  say "  Встановлюю бібліотеки звуку й інтерфейсу…"
  EXTRA=""
  if [ "$OS" = "Darwin" ] && [ "$ARCH" = "x86_64" ]; then EXTRA="numpy<2"; fi
  pip_i -r "$DEST/requirements.txt" $EXTRA || die "Не вдалося встановити бібліотеки. Перевірте інтернет і запустіть ще раз."
  ok "Бібліотеки встановлено"
  if [ "$OS" = "Linux" ] && { [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; }; then
    if ( "$PY" -c "import sys; from PyQt6.QtWidgets import QApplication; from PyQt6 import QtWebEngineWidgets; QApplication(sys.argv)" ) >> "$LOG" 2>&1; then
      ok "Власне вікно програми працюватиме"
    else
      say "  ${A}!${N} Власне вікно не запуститься — бракує системних бібліотек Qt. InkBeat відкриватиметься у браузері."
      say "    Щоб було окреме вікно (Ubuntu/Debian/Mint): ${B}sudo apt install libxcb-cursor0 libnss3 libxkbcommon-x11-0${N}"
      say "    Fedora: ${B}sudo dnf install xcb-util-cursor nss libxkbcommon-x11${N}"
    fi
  fi
}

get_model() {
  say "  Завантажую модель розділення на доріжки (≈80 МБ)…"
  (cd "$DEST" && "$PY" -c "from demucs.pretrained import get_model; get_model('htdemucs_6s')" >> "$LOG" 2>&1) || die "Не вдалося завантажити модель розділення."
  ok "Модель готова"
}

verify() {
  (cd "$DEST" && "$PY" -c "import numpy, scipy, librosa, soundfile, flask, onnxruntime, mido, torch, demucs; from app import server; print('ok')" >> "$LOG" 2>&1) || die "Перевірка не пройшла: якийсь модуль не завантажився."
  say "  Готую перший запуск…"
  (cd "$DEST" && "$PY" -c "import numpy as np, librosa; y=(np.random.randn(88200)*0.1).astype('float32'); librosa.beat.beat_track(y=y, sr=22050); librosa.pyin(y[:44100], fmin=80, fmax=800, sr=22050)" >> "$LOG" 2>&1)
  date > "$RT/installed.ok"
  ok "Усе працює"
}

linux_shortcuts() {
  [ "$OS" = "Linux" ] || return 0
  BIN="$HOME/.local/bin"; APPS="$HOME/.local/share/applications"; ICONS="$HOME/.local/share/icons/hicolor/256x256/apps"
  mkdir -p "$BIN" "$APPS" "$ICONS"
  cp "$DEST/app/ui/inkbeat.png" "$ICONS/inkbeat.png" 2>/dev/null
  cat > "$BIN/inkbeat" <<EOF
#!/bin/bash
cd "$DEST" && exec "$PY" "$DEST/run.py" --auto-exit "\$@"
EOF
  chmod +x "$BIN/inkbeat"
  cat > "$APPS/inkbeat.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=InkBeat
Comment=Пісня → редаговані доріжки для FL Studio
Exec="$BIN/inkbeat"
Icon=inkbeat
Terminal=false
Categories=AudioVideo;Audio;Music;
StartupWMClass=InkBeat
EOF
  cat > "$DEST/uninstall.sh" <<EOF
#!/bin/bash
echo "Видаляю InkBeat (проєкти в ~/Documents/InkBeat Projects залишаться)…"
rm -f "$BIN/inkbeat" "$APPS/inkbeat.desktop" "$ICONS/inkbeat.png"
rm -rf "$DEST"
echo "Готово."
EOF
  chmod +x "$DEST/uninstall.sh"
  if [ -d "$HOME/Desktop" ]; then cp "$APPS/inkbeat.desktop" "$HOME/Desktop/InkBeat.desktop" && chmod +x "$HOME/Desktop/InkBeat.desktop"; command -v gio >/dev/null 2>&1 && gio set "$HOME/Desktop/InkBeat.desktop" metadata::trusted true 2>/dev/null; fi
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS" >/dev/null 2>&1
  ok "Ярлики створено: меню програм, робочий стіл і команда «inkbeat»"
}

main() {
  mkdir -p "$DEST" || die "Не вдалося створити папку $DEST"
  : > "$LOG"
  banner
  TOTAL=8
  step 1 $TOTAL "Перевіряю інтернет"; need_net; ok "З'єднання є"
  step 2 $TOTAL "Копіюю файли програми"; copy_app
  step 3 $TOTAL "Середовище Python"; get_python
  step 4 $TOTAL "Встановлювач пакетів"; get_pip
  step 5 $TOTAL "Обчислювальний рушій"; get_torch
  step 6 $TOTAL "Бібліотеки"; get_deps
  step 7 $TOTAL "Модель розділення"; get_model
  step 8 $TOTAL "Перевірка і перший запуск"; verify
  linux_shortcuts
  printf "\n${G}${B}  Готово! InkBeat встановлено.${N}\n"
  if [ "$OS" = "Linux" ]; then
    printf "  Запуск: ярлик InkBeat у меню програм або команда ${B}inkbeat${N}\n  Видалення: ${B}%s/uninstall.sh${N}\n\n" "$DEST"
  else
    printf "  Програма відкриється автоматично. Далі запускайте InkBeat з «Програм».\n\n"
  fi
}

main "$@"
