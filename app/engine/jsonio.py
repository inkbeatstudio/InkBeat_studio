from __future__ import annotations

import json
import os
from pathlib import Path


def read_json(path: Path, default=None):
    path = Path(path)
    if not path.exists():
        return default
    raw = path.read_bytes()
    if not raw.strip():
        return default
    for enc in ("utf-8-sig", "cp1251", "cp1252"):
        try:
            return json.loads(raw.decode(enc))
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue
    return default


def write_json(path: Path, obj, indent: int | None = 1):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=indent), encoding="utf-8")
    os.replace(tmp, path)
