from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

import numpy as np

from .jsonio import read_json, write_json

ROOT = Path(__file__).resolve().parents[2]
CFG = Path.home() / ".inkbeat" / "vst.json"


def available() -> bool:
    try:
        __import__("pedalboard")
        return True
    except Exception:
        return False


def default_dirs() -> list[str]:
    out = []
    if sys.platform == "win32":
        for env in ("COMMONPROGRAMFILES", "COMMONPROGRAMFILES(X86)"):
            v = os.environ.get(env)
            if v:
                out.append(str(Path(v) / "VST3"))
        la = os.environ.get("LOCALAPPDATA")
        if la:
            out.append(str(Path(la) / "Programs" / "Common" / "VST3"))
    elif sys.platform == "darwin":
        out += ["/Library/Audio/Plug-Ins/VST3", str(Path.home() / "Library/Audio/Plug-Ins/VST3")]
    else:
        out += [str(Path.home() / ".vst3"), "/usr/lib/vst3", "/usr/local/lib/vst3"]
    return out


def config() -> dict:
    c = read_json(CFG, {}) or {}
    c.setdefault("folders", [])
    c.setdefault("plugins", [])
    c.setdefault("mtimes", {})
    return c


def save_config(c: dict):
    CFG.parent.mkdir(parents=True, exist_ok=True)
    write_json(CFG, c)


def bridge(cmd: str, args: dict, timeout: float = 120.0) -> dict:
    tmp = Path(tempfile.gettempdir()) / "inkbeat_vst"
    tmp.mkdir(exist_ok=True)
    k = uuid.uuid4().hex[:8]
    af, of = tmp / f"{k}_in.json", tmp / f"{k}_out.json"
    af.write_text(json.dumps(args, ensure_ascii=False), encoding="utf-8")
    try:
        r = subprocess.run([sys.executable, "-m", "app.engine.vstbridge", cmd, str(af), str(of)], cwd=str(ROOT),
                           capture_output=True, text=True, timeout=timeout,
                           creationflags=0x08000000 if sys.platform == "win32" and cmd != "edit" else 0)
        if not of.exists():
            msg = (r.stderr or r.stdout or "").strip().splitlines()[-1:] or ["процес плагіна завершився без відповіді"]
            raise RuntimeError("Плагін аварійно завершився: " + msg[0][:300])
        res = json.loads(of.read_text(encoding="utf-8"))
        if not res.get("ok"):
            raise RuntimeError(res.get("error") or "помилка плагіна")
        return res["result"]
    except subprocess.TimeoutExpired:
        raise RuntimeError("Плагін не відповідає (перевищено час очікування).")
    finally:
        for f in (af, of):
            try:
                f.unlink()
            except Exception:
                pass


def scan(progress=None, force=False) -> list[dict]:
    c = config()
    dirs = [d for d in default_dirs() + c["folders"] if d and Path(d).exists()]
    files = []
    for d in dirs:
        for p in Path(d).rglob("*.vst3"):
            if p.suffix.lower() == ".vst3" and not any(x.suffix.lower() == ".vst3" for x in p.parents if x != p):
                files.append(p)
    files = sorted(set(files))
    old = {(x["path"], x.get("name")): x for x in c["plugins"]}
    from concurrent.futures import ThreadPoolExecutor

    done = [0]

    def one(f):
        key = str(f)
        mt = str(int(f.stat().st_mtime))
        cached = [x for (pth, _), x in old.items() if pth == key]
        if cached and c["mtimes"].get(key) == mt and not force:
            res = cached
        else:
            try:
                res = bridge("probe", {"path": key}, timeout=90)
            except Exception as e:
                res = [{"path": key, "name": f.stem, "error": str(e)[:300]}]
            c["mtimes"][key] = mt
        done[0] += 1
        if progress:
            progress(done[0] / max(1, len(files)))
        return res

    with ThreadPoolExecutor(max_workers=3) as ex:
        out = [x for res in ex.map(one, files) for x in res]
    c["plugins"] = out
    save_config(c)
    return out


def vst2_count() -> int:
    dirs = []
    if sys.platform == "win32":
        for env in ("PROGRAMFILES", "PROGRAMFILES(X86)"):
            v = os.environ.get(env)
            if v:
                dirs += [Path(v) / "VSTPlugins", Path(v) / "Steinberg" / "VstPlugins", Path(v) / "Common Files" / "VST2", Path(v) / "Common Files" / "Steinberg" / "VST2"]
    elif sys.platform == "darwin":
        dirs += [Path("/Library/Audio/Plug-Ins/VST"), Path.home() / "Library/Audio/Plug-Ins/VST"]
    else:
        dirs += [Path.home() / ".vst", Path("/usr/lib/vst")]
    n = 0
    for d in dirs:
        try:
            if d.exists():
                n += sum(1 for p in d.rglob("*") if p.suffix.lower() in (".dll", ".vst", ".so"))
        except Exception:
            pass
        if n > 999:
            break
    return n


def plugins() -> dict:
    c = config()
    return {"available": available(), "folders": c["folders"], "default": default_dirs(), "vst2": vst2_count(),
            "plugins": sorted(c["plugins"], key=lambda x: (x.get("instrument", False), (x.get("name") or "").lower()))}


def edit(path: str, name: str | None, state: str | None) -> dict:
    return bridge("edit", {"path": path, "name": name, "state": state}, timeout=3 * 3600)


def process_array(y: np.ndarray, sr: int, path: str, name: str | None, state: str | None, keep_tail=False) -> np.ndarray:
    import soundfile as sf

    tmp = Path(tempfile.gettempdir()) / "inkbeat_vst"
    tmp.mkdir(exist_ok=True)
    k = uuid.uuid4().hex[:8]
    fi, fo = tmp / f"{k}_a.wav", tmp / f"{k}_b.wav"
    sf.write(str(fi), np.atleast_2d(y).T, sr, subtype="FLOAT")
    try:
        bridge("process", {"path": path, "name": name, "state": state, "in": str(fi), "out": str(fo), "keep_tail": keep_tail},
               timeout=1800)
        out, _ = sf.read(str(fo), dtype="float32", always_2d=True)
        return out.T
    finally:
        for f in (fi, fo):
            try:
                f.unlink()
            except Exception:
                pass


def render_notes(path: str, name: str | None, state: str | None, notes: list, duration: float, sr: int = 44100) -> np.ndarray:
    import soundfile as sf

    tmp = Path(tempfile.gettempdir()) / "inkbeat_vst"
    tmp.mkdir(exist_ok=True)
    fo = tmp / f"{uuid.uuid4().hex[:8]}_r.wav"
    try:
        bridge("render", {"path": path, "name": name, "state": state, "notes": notes, "duration": duration, "sr": sr,
                          "out": str(fo)}, timeout=1800)
        out, _ = sf.read(str(fo), dtype="float32", always_2d=True)
        return out.T
    finally:
        try:
            fo.unlink()
        except Exception:
            pass
