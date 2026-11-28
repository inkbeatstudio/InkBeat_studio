from __future__ import annotations

import importlib
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

TORCH = "2.6.0"
DEMUCS = "demucs==4.0.1"
STATE: dict = {"running": False, "progress": 0.0, "stage": "", "error": None, "done": False, "log": []}
_LOCK = threading.Lock()


def status() -> dict:
    importlib.invalidate_caches()
    have_torch = have_demucs = False
    try:
        importlib.import_module("torch")
        have_torch = True
    except Exception:
        pass
    try:
        importlib.import_module("demucs")
        have_demucs = True
    except Exception:
        pass
    model = False
    try:
        hub = Path(os.environ.get("TORCH_HOME") or Path.home() / ".cache" / "torch") / "hub" / "checkpoints"
        model = any(hub.glob("*.th")) if hub.exists() else False
    except Exception:
        pass
    return {"torch": have_torch, "demucs": have_demucs, "model": model, "ready": have_torch and have_demucs,
            "running": STATE["running"], "progress": STATE["progress"], "stage": STATE["stage"], "error": STATE["error"],
            "gpu": has_nvidia(), "platform": sys.platform}


def has_nvidia() -> bool:
    if sys.platform == "darwin":
        return False
    if shutil.which("nvidia-smi"):
        try:
            r = subprocess.run(["nvidia-smi", "-L"], capture_output=True, timeout=10, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            return r.returncode == 0
        except Exception:
            return False
    return sys.platform == "win32" and Path(os.environ.get("SystemRoot", "C:\\Windows"), "System32", "nvidia-smi.exe").exists()


def _installer():
    root = Path(sys.executable).resolve().parent
    for cand in (root / "uv.exe", root / "uv", root / "Scripts" / "uv.exe"):
        if cand.exists():
            return [str(cand), "pip", "install", "--python", sys.executable]
    uv = shutil.which("uv")
    if uv and os.environ.get("INKBEAT_NO_UV") != "1":
        return [uv, "pip", "install", "--python", sys.executable]
    return [sys.executable, "-m", "pip", "install", "--no-warn-script-location", "--disable-pip-version-check"]


def _run(args, lo, hi, label, expect_s):
    STATE["stage"] = label
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    env = dict(os.environ, PYTHONUTF8="1", PIP_DEFAULT_TIMEOUT="120", PIP_RETRIES="10")
    p = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace",
                         creationflags=flags, env=env)
    t0 = time.time()
    tail = []

    def creep():
        while p.poll() is None:
            f = 1 - pow(2.718, -(time.time() - t0) / max(5.0, expect_s))
            STATE["progress"] = max(STATE["progress"], lo + (hi - lo) * min(0.97, f))
            time.sleep(0.5)

    th = threading.Thread(target=creep, daemon=True)
    th.start()
    for line in p.stdout:
        line = line.rstrip()
        if not line:
            continue
        tail.append(line)
        del tail[:-40]
        m = re.search(r"(Downloading|Collecting|Installing|Prepared|Installed|Downloaded)\s+(\S+)", line)
        if m:
            STATE["stage"] = f"{label}: {m.group(2)[:60]}"
    p.wait()
    STATE["log"] = tail
    if p.returncode != 0:
        raise RuntimeError("\n".join(tail[-6:]) or f"код {p.returncode}")
    STATE["progress"] = hi


def install_separation(gpu: bool | None = None):
    with _LOCK:
        if STATE["running"]:
            return
        STATE.update(running=True, progress=0.01, stage="Готую встановлення…", error=None, done=False)
    try:
        st = status()
        use_gpu = st["gpu"] if gpu is None else bool(gpu)
        base = _installer()
        if not st["torch"]:
            if sys.platform == "darwin":
                spec = [f"torch=={TORCH}", f"torchaudio=={TORCH}"]
                extra = []
            elif use_gpu:
                spec = [f"torch=={TORCH}+cu124", f"torchaudio=={TORCH}+cu124"]
                extra = ["--index-url", "https://download.pytorch.org/whl/cu124"]
            else:
                spec = [f"torch=={TORCH}+cpu", f"torchaudio=={TORCH}+cpu"]
                extra = ["--index-url", "https://download.pytorch.org/whl/cpu"]
            try:
                _run(base + spec + extra, 0.02, 0.7, "Обчислювальний рушій", 600 if use_gpu else 150)
            except Exception:
                if base[0] != sys.executable:
                    base = [sys.executable, "-m", "pip", "install", "--no-warn-script-location", "--disable-pip-version-check"]
                    _run(base + spec + extra, 0.02, 0.7, "Обчислювальний рушій", 600 if use_gpu else 200)
                elif use_gpu:
                    _run(base + [f"torch=={TORCH}+cpu", f"torchaudio=={TORCH}+cpu", "--index-url", "https://download.pytorch.org/whl/cpu"],
                         0.02, 0.7, "Обчислювальний рушій", 200)
                else:
                    raise
        STATE["progress"] = max(STATE["progress"], 0.7)
        if not status()["demucs"]:
            _run(base + [DEMUCS], 0.7, 0.85, "Модуль розділення", 60)
        importlib.invalidate_caches()
        _run([sys.executable, "-c", "from demucs.pretrained import get_model; get_model('htdemucs_6s'); print('ok')"], 0.85, 1.0,
             "Модель розділення", 90)
        STATE.update(progress=1.0, stage="Готово", done=True)
    except Exception as e:
        STATE["error"] = str(e)[-600:]
        STATE["stage"] = "Помилка"
    finally:
        STATE["running"] = False


def start(gpu: bool | None = None) -> dict:
    if not STATE["running"]:
        threading.Thread(target=install_separation, args=(gpu,), daemon=True).start()
        time.sleep(0.05)
    return status()
