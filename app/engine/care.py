from __future__ import annotations

import json
import platform
import re
import shutil
import subprocess
import sys
import time
import uuid
import zipfile
from pathlib import Path

from . import project as P
from .jsonio import read_json, write_json

ROOT = Path(__file__).resolve().parents[2]
SKIP_DIRS = {".venv", "runtime", "__pycache__", ".git", "tests"}


def report(ui_errors: list, jobs: list, note: str = "") -> Path:
    stamp = time.strftime("%Y-%m-%d_%H-%M")
    out_dir = Path.home() / "Desktop"
    if not out_dir.exists():
        out_dir = P.workspace()
    dest = out_dir / f"InkBeat - звіт {stamp}.zip"
    info = {"version": P.VERSION, "python": sys.version, "platform": platform.platform(), "machine": platform.machine(),
            "processor": platform.processor(), "root": str(ROOT), "workspace": str(P.workspace()), "time": stamp, "note": note}
    try:
        import torch

        info["torch"] = torch.__version__
        info["cuda"] = torch.cuda.is_available()
        if info["cuda"]:
            info["gpu"] = torch.cuda.get_device_name(0)
    except Exception as e:
        info["torch"] = f"нема: {e}"
    for mod in ("numpy", "scipy", "librosa", "soundfile", "onnxruntime", "flask", "demucs", "webview", "pedalboard", "mido"):
        try:
            m = __import__(mod)
            info[mod] = getattr(m, "__version__", "так")
        except Exception:
            info[mod] = "нема"
    projects = []
    for p in sorted(P.workspace().glob("*/project.json"))[-30:]:
        d = p.parent
        projects.append({"id": d.name, "files": sum(1 for _ in d.rglob("*")),
                         "mb": round(sum(f.stat().st_size for f in d.rglob("*") if f.is_file()) / 1e6, 1)})
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("system.json", json.dumps(info, ensure_ascii=False, indent=2))
        z.writestr("ui_errors.json", json.dumps(ui_errors[-100:], ensure_ascii=False, indent=2))
        z.writestr("jobs.json", json.dumps(jobs[-40:], ensure_ascii=False, indent=2, default=str))
        z.writestr("projects.json", json.dumps(projects, ensure_ascii=False, indent=2))
        logs = Path.home() / ".inkbeat"
        for f in list(logs.glob("*.log")) + [Path(__import__("tempfile").gettempdir()) / n for n in ("inkbeat_setup.log", "inkbeat_run.log", "inkbeat_lnk.log")]:
            if f.exists() and f.is_file():
                data = f.read_bytes()[-2_000_000:]
                z.writestr("logs/" + f.name, data)
    return dest


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


def _version_of(root: Path) -> str:
    f = root / "app" / "engine" / "project.py"
    m = re.search(r'VERSION\s*=\s*"([^"]+)"', f.read_text(encoding="utf-8")) if f.exists() else None
    return m.group(1) if m else "?"


def update_from_zip(zpath: Path, progress=None) -> dict:
    tmp = Path(P.workspace()) / "_uploads" / ("upd-" + uuid.uuid4().hex[:8])
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
        new_v, old_v = _version_of(src), _version_of(ROOT)
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
            r = subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-r", str(ROOT / "requirements.txt")],
                               capture_output=True, text=True, timeout=1800,
                               creationflags=0x08000000 if sys.platform == "win32" else 0)
            pip_log = (r.stdout or "")[-2000:] + (r.stderr or "")[-2000:]
            if r.returncode != 0:
                raise RuntimeError("Файли оновлено, але не вдалося доставити бібліотеки. Запустіть інсталятор InkBeat-Setup ще раз: він доставить потрібне, проєкти залишаться.\n" + pip_log[-600:])
        if progress:
            progress(1.0)
        return {"old": old_v, "new": new_v, "files": len(files), "deps": bool(pip_log)}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def archive(pid: str, dest: Path, progress=None) -> Path:
    d = P.workspace() / pid
    files = [f for f in d.rglob("*") if f.is_file() and "export" not in f.relative_to(d).parts[:1]]
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED, compresslevel=3) as z:
        z.writestr("inkbeat_archive.json", json.dumps({"pid": pid, "version": P.VERSION, "time": time.strftime("%Y-%m-%d %H:%M")}))
        for i, f in enumerate(files):
            rel = f.relative_to(d)
            if rel.parts[0] == "cache" and f.suffix in (".npz", ".npy") and f.stat().st_size > 30_000_000:
                continue
            z.write(f, "project/" + rel.as_posix())
            if progress and i % 10 == 0:
                progress(i / max(1, len(files)))
    return dest


def _unique_pid(base: str) -> str:
    ws = P.workspace()
    pid = time.strftime("%Y%m%d-%H%M%S") + "-" + P.slugify(base).lower().replace(" ", "-")[:40]
    while (ws / pid).exists():
        pid += "-2"
    return pid


def import_archive(zpath: Path) -> str:
    with zipfile.ZipFile(zpath) as z:
        names = z.namelist()
        if "inkbeat_archive.json" not in names or "project/project.json" not in names:
            raise ValueError("Це не архів проєкту InkBeat.")
        meta = json.loads(z.read("inkbeat_archive.json").decode("utf-8"))
        p = json.loads(z.read("project/project.json").decode("utf-8"))
        pid = _unique_pid(p.get("title") or meta.get("pid") or "project")
        dest = P.workspace() / pid
        dest.mkdir(parents=True)
        for n in names:
            if not n.startswith("project/") or n.endswith("/"):
                continue
            rel = Path(n[len("project/"):])
            if ".." in rel.parts:
                continue
            out = dest / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            with z.open(n) as src, open(out, "wb") as dst:
                shutil.copyfileobj(src, dst)
    p = read_json(dest / "project.json")
    p["id"] = pid
    write_json(dest / "project.json", p)
    return pid


def duplicate(pid: str, title: str | None = None) -> str:
    src = P.workspace() / pid
    p = read_json(src / "project.json")
    new_title = (title or f"{p.get('title', 'Проєкт')} (копія)").strip()
    npid = _unique_pid(new_title)
    shutil.copytree(src, P.workspace() / npid, ignore=shutil.ignore_patterns("export"))
    q = read_json(P.workspace() / npid / "project.json")
    q["id"] = npid
    q["title"] = new_title
    write_json(P.workspace() / npid / "project.json", q)
    return npid


def recover_mix(pdir: Path) -> bool:
    f = pdir / "mix.json"
    if not f.exists():
        return False
    try:
        json.loads(f.read_text(encoding="utf-8-sig"))
        return False
    except Exception:
        pass
    snaps = sorted((pdir / "snapshots").glob("*.json"), reverse=True) if (pdir / "snapshots").exists() else []
    for s in snaps:
        j = read_json(s, None)
        if j and j.get("mix"):
            shutil.copy2(f, pdir / f"mix.broken-{int(time.time())}.json")
            write_json(f, j["mix"], None)
            return True
    shutil.move(str(f), str(pdir / f"mix.broken-{int(time.time())}.json"))
    return True
