from __future__ import annotations

import hashlib
import json
import os
import re
import ssl
import time
import urllib.error
import urllib.request
from pathlib import Path

from . import project as P

ROOT = Path(__file__).resolve().parents[2]
PREFS = Path.home() / ".inkbeat" / "update.json"
ASSET = "InkBeat-update.zip"
DEFAULTS = {"auto_check": True, "auto_install": True, "skip": "", "last_check": 0}
_cache = {"t": 0, "data": None}


def source() -> dict:
    cfg = {"repo": "inkbeatstudio/InkBeat_studio"}
    f = ROOT / "update.json"
    if f.exists():
        try:
            cfg.update(json.loads(f.read_text(encoding="utf-8")))
        except Exception:
            pass
    p = prefs()
    if p.get("repo"):
        cfg["repo"] = p["repo"]
    return cfg


def prefs() -> dict:
    out = dict(DEFAULTS)
    try:
        out.update(json.loads(PREFS.read_text(encoding="utf-8")))
    except Exception:
        pass
    return out


def save_prefs(patch: dict) -> dict:
    p = prefs()
    for k in ("auto_check", "auto_install", "skip", "repo", "last_check"):
        if k in patch:
            p[k] = patch[k]
    if "repo" in p:
        r = (p["repo"] or "").strip().strip("/")
        r = re.sub(r"^https?://github\.com/", "", r)
        p["repo"] = r if re.fullmatch(r"[\w.-]+/[\w.-]+", r) else ""
    PREFS.parent.mkdir(parents=True, exist_ok=True)
    PREFS.write_text(json.dumps(p, ensure_ascii=False, indent=1), encoding="utf-8")
    _cache["t"] = 0
    return p


def _ctx():
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def _open(url: str, timeout: float = 15, accept: str = "application/vnd.github+json"):
    req = urllib.request.Request(url, headers={"User-Agent": f"InkBeat/{P.VERSION}", "Accept": accept})
    return urllib.request.urlopen(req, timeout=timeout, context=_ctx())


def vtuple(v: str) -> tuple:
    nums = re.findall(r"\d+", v or "")
    return tuple(int(x) for x in nums[:4]) + (0,) * (4 - len(nums[:4]))


def api_base() -> str:
    return os.environ.get("INKBEAT_UPDATE_API", "https://api.github.com").rstrip("/")


def check(force: bool = False) -> dict:
    if not force and _cache["data"] and time.time() - _cache["t"] < 600:
        return _cache["data"]
    repo = source()["repo"]
    out = {"current": P.VERSION, "repo": repo, "available": False}
    try:
        with _open(f"{api_base()}/repos/{repo}/releases/latest") as r:
            rel = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            out["error"] = f"На GitHub ({repo}) ще немає опублікованих версій або репозиторій приватний."
        elif e.code == 403:
            out["error"] = "GitHub тимчасово обмежив кількість перевірок. Спробуйте пізніше."
        else:
            out["error"] = f"GitHub відповів помилкою {e.code}."
        return out
    except Exception:
        out["error"] = "Немає з'єднання з GitHub. Перевірте інтернет."
        return out
    latest = (rel.get("tag_name") or "").lstrip("vV")
    assets = {a.get("name"): a for a in rel.get("assets") or []}
    a = assets.get(ASSET)
    sha = assets.get(ASSET + ".sha256")
    out.update({"latest": latest, "notes": rel.get("body") or "", "name": rel.get("name") or latest,
                "published": rel.get("published_at") or "", "page": rel.get("html_url") or f"https://github.com/{repo}/releases",
                "url": a.get("browser_download_url") if a else None, "size": a.get("size", 0) if a else 0,
                "sha_url": sha.get("browser_download_url") if sha else None})
    out["available"] = bool(a) and vtuple(latest) > vtuple(P.VERSION)
    if vtuple(latest) > vtuple(P.VERSION) and not a:
        out["error"] = "Нова версія вже з'явилася, але файл оновлення ще готується. Спробуйте за кілька хвилин."
    save_prefs({"last_check": int(time.time())})
    _cache.update(t=time.time(), data=out)
    return out


def install(progress=None) -> dict:
    from . import care

    info = check(force=True)
    if not info.get("available"):
        raise RuntimeError(info.get("error") or "У вас уже найновіша версія.")
    tmpd = P.workspace() / "_uploads"
    tmpd.mkdir(parents=True, exist_ok=True)
    dest = tmpd / "github-update.zip"
    h = hashlib.sha256()
    with _open(info["url"], timeout=60, accept="application/octet-stream") as r, open(dest, "wb") as fh:
        total = int(r.headers.get("Content-Length") or info.get("size") or 0)
        got = 0
        while True:
            chunk = r.read(256 * 1024)
            if not chunk:
                break
            fh.write(chunk)
            h.update(chunk)
            got += len(chunk)
            if progress and total:
                progress(0.5 * got / total)
    try:
        if info.get("sha_url"):
            with _open(info["sha_url"], timeout=20, accept="text/plain") as r:
                want = r.read().decode("utf-8", "ignore").split()[0].lower()
            if want and want != h.hexdigest():
                raise RuntimeError("Файл оновлення пошкодився під час завантаження. Спробуйте ще раз.")
        res = care.update_from_zip(dest, (lambda f: progress(0.5 + 0.5 * f)) if progress else None)
    finally:
        dest.unlink(missing_ok=True)
    _cache["t"] = 0
    res["notes"] = info.get("notes", "")
    return res
