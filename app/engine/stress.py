from __future__ import annotations

import threading
from collections import Counter
from pathlib import Path

_PATH = Path(__file__).resolve().parent / "data" / "stress.trie"
_LOCK = threading.Lock()
_STATE: dict = {}
_VOWELS = set("аеєиіїоуюяАЕЄИІЇОУЮЯ")


def available() -> bool:
    return _trie() is not None


def _trie():
    if "t" in _STATE:
        return _STATE["t"]
    with _LOCK:
        if "t" in _STATE:
            return _STATE["t"]
        t = None
        try:
            import marisa_trie

            if _PATH.exists():
                t = marisa_trie.BytesTrie()
                t.load(str(_PATH))
        except Exception:
            t = None
        _STATE["t"] = t
        return t


def _positions(value: bytes) -> list[int]:
    if b"\xff" not in value:
        return list(value)
    out = []
    for rec in value.split(b"\xff"):
        if rec:
            out.append(rec.partition(b"\xfe")[0][:1])
    c = Counter(x for x in out if x)
    return [c.most_common(1)[0][0][0]] if c else []


def index(word: str) -> int:
    w = word.replace("’", "'").replace("ʼ", "'").replace("`", "'").strip("'")
    if not w:
        return -1
    letters = w.replace("'", "")
    vow = [i for i, ch in enumerate(letters) if ch in _VOWELS]
    if len(vow) == 1:
        return vow[0]
    if not vow:
        return -1
    t = _trie()
    if t is None:
        return -1
    for cand in (w, w.lower(), w.capitalize(), w.title()):
        vals = t.get(cand)
        if vals:
            pos = _positions(vals[0])
            if not pos:
                return -1
            i = pos[0] - 1
            if i < 0 or i >= len(cand):
                return -1
            j = i - cand[:i].count("'")
            return j if 0 <= j < len(letters) and letters[j] in _VOWELS else -1
    return -1


def lookup(words: list[str]) -> dict:
    return {w: index(w) for w in words[:20000] if isinstance(w, str) and len(w) <= 40}
