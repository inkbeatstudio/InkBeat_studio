from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKIP_DIRS = {".venv", "runtime", "__pycache__", ".git", ".github", "tests", "dist", "build"}
TMP = Path.home() / ".inkbeat" / "tmp"


def version_of(root: Path) -> str:
    f = root / "app" / "engine" / "project.py"
    m = re.search(r'^VERSION\s*=\s*"([^"]+)"', f.read_text(encoding="utf-8"), re.M) if f.exists() else None
    return m.group(1) if m else "?"


VERSION = version_of(ROOT)
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
    for k in ("auto_check", "auto_install", "skip", "repo", "last_check", "just_updated"):
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


TIMEOUT = {"v": 15.0}


def _open(url: str, timeout: float = 15, accept: str = "application/vnd.github+json"):
    timeout = min(timeout, TIMEOUT["v"]) if TIMEOUT["v"] < 15 else timeout
    req = urllib.request.Request(url, headers={"User-Agent": f"InkBeat/{VERSION}", "Accept": accept})
    return urllib.request.urlopen(req, timeout=timeout, context=_ctx())


def vtuple(v: str) -> tuple:
    nums = re.findall(r"\d+", v or "")
    return tuple(int(x) for x in nums[:4]) + (0,) * (4 - len(nums[:4]))


def api_base() -> str:
    return os.environ.get("INKBEAT_UPDATE_API", "https://api.github.com").rstrip("/")


def raw_base() -> str:
    return os.environ.get("INKBEAT_UPDATE_RAW", "https://raw.githubusercontent.com").rstrip("/")


def code_base() -> str:
    return os.environ.get("INKBEAT_UPDATE_CODE", "https://codeload.github.com").rstrip("/")


def _text(url: str, timeout: float = 15) -> str:
    with _open(url, timeout=timeout, accept="text/plain") as r:
        return r.read().decode("utf-8", "ignore")


def _notes_for(changelog: str, ver: str) -> str:
    m = re.search(rf"^##\s*\[?v?{re.escape(ver)}\]?[^\n]*\n(.*?)(?=^##\s|\Z)", changelog, re.S | re.M)
    return m.group(1).strip() if m else ""


def _release(repo: str) -> dict | None:
    try:
        with _open(f"{api_base()}/repos/{repo}/releases/latest") as r:
            rel = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code in (403, 429):
            return {"limited": True}
        return None
    except Exception:
        return None
    assets = {a.get("name"): a for a in rel.get("assets") or []}
    a, sha = assets.get(ASSET), assets.get(ASSET + ".sha256")
    if not a:
        return None
    return {"version": (rel.get("tag_name") or "").lstrip("vV"), "notes": rel.get("body") or "",
            "page": rel.get("html_url") or f"https://github.com/{repo}/releases", "url": a.get("browser_download_url"),
            "size": a.get("size", 0), "sha_url": sha.get("browser_download_url") if sha else None, "kind": "release"}


def _branch(repo: str) -> dict | None:
    for br in ("main", "master"):
        try:
            src = _text(f"{raw_base()}/{repo}/{br}/app/engine/project.py")
        except urllib.error.HTTPError:
            continue
        except Exception:
            return {"offline": True}
        m = re.search(r'^VERSION\s*=\s*"([^"]+)"', src, re.M)
        if not m:
            continue
        ver = m.group(1)
        notes = ""
        try:
            notes = _notes_for(_text(f"{raw_base()}/{repo}/{br}/CHANGELOG.md"), ver)
        except Exception:
            pass
        return {"version": ver, "notes": notes, "page": f"https://github.com/{repo}", "size": 0, "sha_url": None,
                "url": f"{code_base()}/{repo}/zip/refs/heads/{br}", "kind": "branch"}
    return None


def check(force: bool = False) -> dict:
    if not force and _cache["data"] and time.time() - _cache["t"] < 600:
        return _cache["data"]
    repo = source()["repo"]
    out = {"current": VERSION, "repo": repo, "available": False}
    rel, br = _release(repo), _branch(repo)
    cands = [x for x in (rel, br) if x and x.get("version")]
    if not cands:
        if (br and br.get("offline")) and not rel:
            out["error"] = "Немає з'єднання з GitHub. Перевірте інтернет."
        elif rel and rel.get("limited") and not br:
            out["error"] = "GitHub тимчасово обмежив кількість перевірок. Спробуйте пізніше."
        else:
            out["error"] = f"Не знайшов програму в репозиторії {repo}. Перевірте, що він публічний і що в ньому є файли InkBeat."
        return out
    best = max(cands, key=lambda x: (vtuple(x["version"]), x["kind"] == "release"))
    out.update({"latest": best["version"], "notes": best["notes"], "name": best["version"], "page": best["page"],
                "url": best["url"], "size": best["size"], "sha_url": best["sha_url"], "source": best["kind"]})
    out["available"] = vtuple(best["version"]) > vtuple(VERSION)
    save_prefs({"last_check": int(time.time())})
    _cache.update(t=time.time(), data=out)
    return out


def _fixname(info: zipfile.ZipInfo) -> str:
    n = info.filename
    if info.flag_bits & 0x800:
        return n
    try:
        return n.encode("cp437").decode("utf-8")
    except Exception:
        return n


def _extract(z: zipfile.ZipFile, dest: Path) -> list[str]:
    names = []
    for info in z.infolist():
        n = _fixname(info).replace("\\", "/")
        names.append(n)
        if n.endswith("/") or ".." in Path(n).parts:
            continue
        out = dest / n
        out.parent.mkdir(parents=True, exist_ok=True)
        with z.open(info) as src, open(out, "wb") as dst:
            shutil.copyfileobj(src, dst)
    return names


def apply_zip(zpath: Path, progress=None) -> dict:
    tmp = TMP / ("upd-" + uuid.uuid4().hex[:8])
    tmp.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(zpath) as z:
            names = [_fixname(i).replace("\\", "/") for i in z.infolist()]
            runs = [n for n in names if n.endswith("run.py") and n.count("/") <= 1]
            if not runs:
                raise ValueError("Це не архів InkBeat: не знайдено run.py.")
            prefix = runs[0][: -len("run.py")]
            if prefix + "app/server.py" not in names:
                raise ValueError("Архів неповний: немає app/server.py.")
            _extract(z, tmp)
        src = tmp / prefix if prefix else tmp
        new_v, old_v = version_of(src), version_of(ROOT)
        old_req = (ROOT / "requirements.txt").read_text(encoding="utf-8") if (ROOT / "requirements.txt").exists() else ""
        new_req = (src / "requirements.txt").read_text(encoding="utf-8") if (src / "requirements.txt").exists() else ""
        files = [f for f in src.rglob("*") if f.is_file() and not (set(f.relative_to(src).parts) & SKIP_DIRS)]
        backup = ROOT / ".backup"
        if backup.exists():
            shutil.rmtree(backup, ignore_errors=True)
        backup.mkdir()
        for i, f in enumerate(files):
            rel = f.relative_to(src)
            dst = ROOT / rel
            if dst.exists():
                (backup / rel).parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(dst, backup / rel)
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, dst)
            if progress and i % 20 == 0:
                progress(0.1 + 0.6 * i / max(1, len(files)))
        pip_log = ""
        if new_req.strip() != old_req.strip():
            if progress:
                progress(0.75)
            r = subprocess.run([sys.executable, "-m", "pip", "install", "-q", "--disable-pip-version-check", "-r", str(ROOT / "requirements.txt")],
                               capture_output=True, text=True, timeout=1800,
                               creationflags=0x08000000 if sys.platform == "win32" else 0)
            pip_log = (r.stdout or "")[-2000:] + (r.stderr or "")[-2000:]
            if r.returncode != 0:
                raise RuntimeError("Файли оновлено, але не вдалося доставити бібліотеки. Запустіть інсталятор InkBeat ще раз: він доставить потрібне, проєкти залишаться.\n" + pip_log[-600:])
        if progress:
            progress(1.0)
        return {"old": old_v, "new": new_v, "files": len(files), "deps": bool(pip_log)}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def install(progress=None) -> dict:
    info = check(force=True)
    if not info.get("available"):
        raise RuntimeError(info.get("error") or "У вас уже найновіша версія.")
    TMP.mkdir(parents=True, exist_ok=True)
    dest = TMP / ("github-update-" + uuid.uuid4().hex[:6] + ".zip")
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
            if progress:
                progress(0.5 * (got / total if total else min(0.95, got / 700000)))
    try:
        if info.get("sha_url"):
            want = _text(info["sha_url"], 20).split()[0].lower()
            if want and want != h.hexdigest():
                raise RuntimeError("Файл оновлення пошкодився під час завантаження. Спробуйте ще раз.")
        res = apply_zip(dest, (lambda f: progress(0.5 + 0.5 * f)) if progress else None)
    finally:
        dest.unlink(missing_ok=True)
    _cache["t"] = 0
    res["notes"] = info.get("notes", "")
    return res


def startup(stage=None) -> dict | None:
    p = prefs()
    if not (p.get("auto_check") and p.get("auto_install")):
        return None
    TIMEOUT["v"] = 3.0
    try:
        info = check(force=True)
        if not info.get("available"):
            return None
        if stage:
            stage(f"Оновлюю InkBeat до версії {info['latest']}…")
        TIMEOUT["v"] = 60.0
        res = install()
        save_prefs({"just_updated": {"version": res["new"], "notes": res.get("notes", "")}})
        return res
    except Exception as e:
        try:
            log = Path.home() / ".inkbeat" / "update.log"
            log.write_text(time.strftime("%Y-%m-%d %H:%M ") + str(e)[:800], encoding="utf-8")
        except Exception:
            pass
        return None
    finally:
        TIMEOUT["v"] = 15.0
