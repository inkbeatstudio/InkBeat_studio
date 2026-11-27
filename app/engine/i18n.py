from __future__ import annotations

import json
import re
from pathlib import Path

_CY = re.compile(r"[А-Яа-яІіЇїЄєҐґ]")
_UNITS = {"мс": "ms", "Гц": "Hz", "кГц": "kHz", "дБ": "dB", "пт": "st", "ц": "c", "с": "s", "хв": "min",
          "тактів": "bars", "такти": "bars", "такт": "bar", "нот": "notes", "ударів": "hits", "доріжок": "tracks",
          "дор.": "tr."}
_UNIT_RX = re.compile(r"(\d[\d.,]*)\s*(мс|кГц|Гц|дБ|пт|хв|тактів|такти|такт|нот|ударів|доріжок|дор\.|ц|с)(?![^\W\d_])")
_STATE: dict = {}
FILE_NAMES = {"Звуковий гід.html": "Sound guide.html", "ЯК ВІДКРИТИ В ІНШИХ ПРОГРАМАХ.txt": "HOW TO OPEN IN OTHER APPS.txt",
              "повний альбом": "full album"}


def _load():
    if "d" in _STATE:
        return _STATE["d"], _STATE["rx"]
    src = (Path(__file__).resolve().parent.parent / "ui" / "i18n_en.js").read_text(encoding="utf-8")
    d = json.loads(src[src.index("{"): src.rindex("}") + 1])
    keys = sorted((k for k in d if len(k) >= 3 and _CY.search(k)), key=len, reverse=True)
    letter = lambda ch: ch.isalpha()
    rx = re.compile("|".join((r"(?<![^\W\d_])" if letter(k[0]) else "") + re.escape(k) +
                             (r"(?![^\W\d_])" if letter(k[-1]) else "") for k in keys)) if keys else None
    _STATE.update(d=d, rx=rx)
    return d, rx


def tr_line(s: str) -> str:
    if not s or not _CY.search(s):
        return s
    d, rx = _load()
    lead = s[: len(s) - len(s.lstrip())]
    tail = s[len(s.rstrip()):]
    core = re.sub(r"\s+", " ", s).strip()
    hit = d.get(core)
    if hit is None and rx is not None:
        hit = rx.sub(lambda m: d[m.group(0)], core)
    if hit is None:
        hit = core
    if _CY.search(hit):
        hit = _UNIT_RX.sub(lambda m: m.group(1) + " " + _UNITS[m.group(2)], hit)
    return lead + hit.replace("«", "“").replace("»", "”") + tail


def _protect(text: str, keep):
    names = sorted({k for k in (keep or []) if isinstance(k, str) and k.strip() and _CY.search(k)}, key=len, reverse=True)
    for i, k in enumerate(names):
        text = text.replace(k, f"\ue000{i}\ue001")
    return text, names


def _restore(text: str, names) -> str:
    for i, k in enumerate(names):
        text = text.replace(f"\ue000{i}\ue001", k)
    return text


def tr_text(text: str, keep=None) -> str:
    text, names = _protect(text, keep)
    return _restore("\n".join(tr_line(x) for x in text.split("\n")), names)


def tr_html(html: str, keep=None) -> str:
    html, names = _protect(html, keep)
    out = re.sub(r">([^<]*[А-Яа-яІіЇїЄєҐґ][^<]*)<", lambda m: ">" + tr_line(m.group(1)) + "<", html)
    return _restore(out, names)


def keep_names(project: dict, tracks: list | None = None) -> list:
    out = [project.get("title") or ""]
    for t in tracks or []:
        out.append(t.get("name") or "")
    return out


def name(s: str, lang: str | None) -> str:
    return FILE_NAMES.get(s, s) if lang == "en" else s
