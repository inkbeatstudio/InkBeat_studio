from __future__ import annotations

import hashlib
import json
import shutil
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

from . import soundfont as SFM

APP = Path(__file__).resolve().parent.parent
GS_PATH = APP / "content" / "GeneralUser-GS.sf2"
MANIFEST = Path(__file__).resolve().parent / "data" / "content_packs.json"
_LOCK = threading.Lock()
_STATE: dict = {}

GM_FAMILIES = [
    ("Фортепіано", "keys"), ("Хроматичні ударні", "mallets"), ("Органи", "keys"), ("Гітари", "guitar"),
    ("Баси", "bass"), ("Струнні", "strings"), ("Ансамблі й хори", "strings"), ("Мідні духові", "brass"),
    ("Саксофони й дерев'яні", "winds"), ("Флейти", "winds"), ("Синт-ліди", "synth"), ("Синт-пади", "synth"),
    ("Синт-ефекти", "fx"), ("Етнічні", "world"), ("Ударні звуки", "perc"), ("Звукові ефекти", "fx"),
]


def library_root() -> Path:
    from .project import workspace

    d = workspace() / "_library" / "packs"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _gs():
    with _LOCK:
        if "gs" not in _STATE:
            _STATE["gs"] = SFM.SF2(GS_PATH) if GS_PATH.exists() else None
        return _STATE["gs"]


def builtin_list() -> list[dict]:
    if "gs_list" in _STATE:
        return _STATE["gs_list"]
    bank = _gs()
    out = []
    if bank is not None:
        for p in bank.presets():
            if p["bank"] == 128:
                cat, tag = "Набори ударних", "drums"
            elif p["bank"] > 127:
                continue
            else:
                cat, tag = GM_FAMILIES[min(15, p["program"] // 8)]
            out.append({"id": f"gs:{p['index']}", "index": p["index"], "name": p["name"], "program": p["program"], "bank": p["bank"],
                        "category": cat, "tag": tag, "drums": p["bank"] == 128, "variation": p["bank"] not in (0, 128)})
    _STATE["gs_list"] = out
    return out


def _save(y, sr, path: Path):
    import soundfile as sf

    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), y, sr, subtype="PCM_16")


def builtin_zones(pdir: Path, index: int) -> dict:
    bank = _gs()
    if bank is None:
        raise ValueError("Вбудована бібліотека інструментів не знайдена. Запустіть інсталятор ще раз.")
    item = next((x for x in builtin_list() if x["index"] == index), None)
    if item is None:
        raise ValueError("Інструмент не знайдено.")
    outd = pdir / "samples" / "_gs" / f"p{index}"
    cache_file = outd / "zones.json"
    if cache_file.exists():
        try:
            return json.loads(cache_file.read_text(encoding="utf-8"))
        except Exception:
            pass
    zones, cache = [], {}
    for z in bank.zones(index):
        key = (z["sid"], json.dumps(z["off"], sort_keys=True))
        if key not in cache:
            y, sr, lp = bank.sample(z["sid"], z["off"])
            fn = outd / f"s{len(cache)}.wav"
            _save(y, sr, fn)
            cache[key] = (str(fn.relative_to(pdir / "samples")).replace("\\", "/"), sr, lp)
        f, sr, lp = cache[key]
        zones.append({"file": f, "lo": z["lo"], "hi": z["hi"], "vlo": z["vlo"], "vhi": z["vhi"], "root": z["root"], "tune": z["tune"],
                      "gain": z["gain"], "pan": z["pan"], "loop": [lp[0] / sr, lp[1] / sr] if z["loop"] and lp else None,
                      "a": z["a"], "r": z["r"], "d": z["d"], "s": z["s"]})
    if not zones:
        raise ValueError("У цьому інструменті немає звуків.")
    res = {"src": {"kind": "gs", "index": index}, "name": item["name"], "drums": item["drums"], "zones": zones}
    outd.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(json.dumps(res, ensure_ascii=False), encoding="utf-8")
    return res


def manifest() -> dict:
    if "man" not in _STATE:
        try:
            _STATE["man"] = json.loads(MANIFEST.read_text(encoding="utf-8"))
        except Exception:
            _STATE["man"] = {"packs": []}
    return _STATE["man"]


def _pack(pid: str) -> dict:
    p = next((x for x in manifest()["packs"] if x["id"] == pid), None)
    if p is None:
        raise ValueError("Пакет не знайдено.")
    return p


def pack_dir(pid: str) -> Path:
    return library_root() / pid


def packs_status() -> list[dict]:
    out = []
    for p in manifest()["packs"]:
        have = _installed(p["id"])
        insts = [{"id": i["id"], "name": i["name"], "drums": i.get("drums", False), "size": i.get("size", 0), "installed": i["id"] in have} for i in p["instruments"]]
        out.append({k: p[k] for k in ("id", "name", "category", "author", "license", "url", "desc", "size", "tag") if k in p} |
                   {"installed": all(i["installed"] for i in insts), "partial": any(i["installed"] for i in insts), "instruments": insts})
    return out


def _installed(pid: str) -> set:
    d = pack_dir(pid)
    try:
        info = json.loads((d / "installed.json").read_text(encoding="utf-8"))
        return {i for i in info.get("insts", []) if (d / i / "zones.json").exists()}
    except Exception:
        return set()


def _fetch(url: str, dest: Path, tries: int = 3):
    last = None
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "InkBeat"})
            with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as fo:
                shutil.copyfileobj(r, fo, 1 << 16)
            return
        except Exception as e:
            last = e
            wait = 1.5 * (k + 1)
            if getattr(e, "code", None) == 429:
                try:
                    wait = max(wait, float(e.headers.get("Retry-After") or 0), 5.0 * (k + 1))
                except Exception:
                    wait = 5.0 * (k + 1)
            time.sleep(min(60.0, wait))
    raise last


def _convert(src: Path, dst: Path, z: dict) -> dict:
    import soundfile as sf

    y, sr = sf.read(str(src), dtype="float32", always_2d=True)
    a = max(0, int(z.get("off", 0)))
    b = int(z.get("end", 0)) or y.shape[0]
    y = y[a:max(a + 1, b)]
    loop = None
    if z.get("loop"):
        ls, le = z["loop"][0] - a, z["loop"][1] - a
        if 0 <= ls < le <= y.shape[0]:
            loop = [ls / sr, le / sr]
            y = y[: min(y.shape[0], le + int(0.05 * sr))]
    mx = int(float(z.get("max", 10)) * sr)
    if loop is None and y.shape[0] > mx:
        y = y[:mx].copy()
        fl = min(int(0.4 * sr), y.shape[0] // 4)
        if fl > 0:
            y[-fl:] *= np.linspace(1, 0, fl, dtype=np.float32)[:, None]
    if sr > 48000:
        import librosa

        y = np.ascontiguousarray(librosa.resample(y.T, orig_sr=sr, target_sr=44100).T)
        sr = 44100
    if y.shape[1] > 2:
        y = y[:, :2]
    _save(y, sr, dst)
    return {"loop": loop}


def install(pid: str, progress=None, cancel=None, only: list | None = None) -> dict:
    p = _pack(pid)
    src = p["source"]
    base = f"https://raw.githubusercontent.com/{src['repo']}/{src['sha']}/"
    d = pack_dir(pid)
    tmp = d / "_dl"
    tmp.mkdir(parents=True, exist_ok=True)
    insts = [i for i in p["instruments"] if not only or i["id"] in only]
    paths = sorted({z["path"] for i in insts for z in i["zones"]})
    total = max(1, len(paths))
    done = [0]
    local = {}

    def get(path):
        if cancel and cancel():
            raise RuntimeError("Скасовано.")
        dest = tmp / (hashlib.md5(path.encode("utf-8")).hexdigest() + Path(path).suffix.lower())
        if not dest.exists() or dest.stat().st_size == 0:
            _fetch(base + urllib.request.quote(path), dest)
        local[path] = dest
        done[0] += 1
        if progress:
            progress(0.9 * done[0] / total)

    with ThreadPoolExecutor(max_workers=4) as ex:
        list(ex.map(get, paths))
    for k, inst in enumerate(insts):
        od = d / inst["id"]
        od.mkdir(parents=True, exist_ok=True)
        zones = []
        conv = {}
        for j, z in enumerate(inst["zones"]):
            key = (z["path"], z.get("off", 0), z.get("end", 0), json.dumps(z.get("loop")))
            if key not in conv:
                fn = od / f"z{len(conv)}.wav"
                conv[key] = (fn, _convert(local[z["path"]], fn, z))
            fn, info = conv[key]
            zones.append({"file": f"pack:{pid}/{inst['id']}/{fn.name}", "lo": z["lo"], "hi": z["hi"], "vlo": z["vlo"], "vhi": z["vhi"],
                          "root": z["root"], "tune": z.get("tune", 0), "gain": z.get("gain", 1), "pan": z.get("pan", 0),
                          "loop": info["loop"], "a": z.get("a", 0.002), "h": z.get("h", 0), "d": z.get("d", 1), "s": z.get("s", 1),
                          "r": z.get("r", 0.25), "fixed": bool(z.get("fixed"))})
        (od / "zones.json").write_text(json.dumps({"src": {"kind": "pack", "pack": pid, "inst": inst["id"]}, "name": f"{p['name']} — {inst['name']}",
                                                   "drums": bool(inst.get("drums")), "zones": zones}, ensure_ascii=False), encoding="utf-8")
        if progress:
            progress(0.9 + 0.1 * (k + 1) / max(1, len(insts)))
    shutil.rmtree(tmp, ignore_errors=True)
    have = _installed(pid) | {i["id"] for i in insts}
    (d / "installed.json").write_text(json.dumps({"at": time.time(), "sha": src["sha"], "insts": sorted(have)}), encoding="utf-8")
    return {"pack": pid, "instruments": len(insts)}


def uninstall(pid: str, iid: str | None = None) -> dict:
    _pack(pid)
    d = pack_dir(pid)
    if not iid:
        shutil.rmtree(d, ignore_errors=True)
        return {"ok": True}
    shutil.rmtree(d / iid, ignore_errors=True)
    have = _installed(pid) - {iid}
    if have:
        (d / "installed.json").write_text(json.dumps({"at": time.time(), "insts": sorted(have)}), encoding="utf-8")
    else:
        shutil.rmtree(d, ignore_errors=True)
    return {"ok": True}


def pack_zones(pid: str, iid: str) -> dict:
    f = pack_dir(pid) / iid / "zones.json"
    if not f.exists():
        raise ValueError("Пакет ще не встановлено.")
    return json.loads(f.read_text(encoding="utf-8"))


def file_path(spec: str) -> Path | None:
    if not spec.startswith("pack:"):
        return None
    root = library_root().resolve()
    f = (root / spec[5:]).resolve()
    if root not in f.parents or not f.exists():
        return None
    return f
