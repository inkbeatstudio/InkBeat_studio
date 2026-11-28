#!/bin/bash
cd "$(dirname "$0")"
if [ ! -x ".venv/bin/python" ]; then
  PY=""
  for c in python3.12 python3.13 python3.11 python3.10 python3; do
    if command -v $c >/dev/null 2>&1 && $c -c 'import sys; exit(0 if (3,10)<=sys.version_info[:2]<=(3,13) else 1)'; then PY=$c; break; fi
  done
  if [ -z "$PY" ]; then
    echo "Потрібен Python 3.10-3.13: https://www.python.org/downloads/"; open "https://www.python.org/downloads/"; read -p "Enter..."; exit 1
  fi
  $PY -m venv .venv || exit 1
  .venv/bin/python -m pip install --upgrade pip wheel
  .venv/bin/python -m pip install torch torchaudio || exit 1
  .venv/bin/python -m pip install -r requirements.txt || exit 1
  .venv/bin/python -m pip install demucs==4.0.1
  .venv/bin/python -c "from demucs.pretrained import get_model; get_model('htdemucs_6s')"
fi
.venv/bin/python run.py
