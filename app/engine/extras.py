from __future__ import annotations

import json
import re
import shutil
import time
import uuid
from pathlib import Path

import numpy as np

from . import project as P
from . import harmony, separation
from .jsonio import read_json, write_json


def libdir() -> Path:
    d = P.workspace() / "_library"
    (d / "samples").mkdir(parents=True, exist_ok=True)
    return d


def library() -> dict:
    d = libdir()
    meta = read_json(d / "samples.json", {})
    out = []
    for f in sorted((d / "samples").glob("*.wav"), key=lambda x: x.name.lower()):
        m = meta.get(f.name, {})
        out.append({"id": "lib:" + f.name, "file": "lib:" + f.name, "name": f.stem, "dur": m.get("dur", 0),
                    "root": m.get("root"), "root_name": m.get("root_name"), "kind": m.get("kind", "note"),
                    "bpm": m.get("bpm"), "key": m.get("key")})
    return {"samples": out, "presets": read_json(d / "presets.json", {"synth": {}, "fx": {}, "chain": {}})}


def add_sample(src: Path, name: str) -> dict:
    import librosa

    y, sr = P.load_audio(src, 44100)
    y = y[:2]
    mono = y.mean(axis=0)
    idx = np.nonzero(np.abs(mono) > 10 ** (-50 / 20) * (np.max(np.abs(mono)) + 1e-9))[0]
    if len(idx):
        a = max(0, idx[0] - 64)
        b = min(len(mono), idx[-1] + 2048)
        y = y[:, a:b]
    y = y[:, : 20 * sr]
    peak = float(np.max(np.abs(y))) + 1e-9
    y = y * (10 ** (-1 / 20) / peak)
    fade = min(256, y.shape[1] // 4)
    if fade > 0:
        y[:, -fade:] *= np.linspace(1, 0, fade)
    dur = y.shape[1] / sr
    root = None
    kind = "hit"
    seg = librosa.resample(y.mean(axis=0)[: int(sr * 2.5)], orig_sr=sr, target_sr=22050)
    if len(seg) > 22050 * 0.12:
        try:
            f0, vflag, _ = librosa.pyin(seg, fmin=40, fmax=2000, sr=22050, frame_length=2048)
            v = f0[vflag & np.isfinite(f0)]
            if len(v) > max(4, 0.35 * len(f0)):
                root = int(round(float(np.median(librosa.hz_to_midi(v)))))
                kind = "note"
        except Exception:
            pass
    base = P.slugify(name or src.stem)[:60] or "sample"
    d = libdir()
    dest = d / "samples" / f"{base}.wav"
    n = 2
    while dest.exists():
        dest = d / "samples" / f"{base} ({n}).wav"
        n += 1
    P.save_wav(dest, y, sr, "PCM_16")
    meta = read_json(d / "samples.json", {})
    names = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
    meta[dest.name] = {"dur": round(dur, 3), "root": root, "kind": kind,
                       "root_name": f"{names[root % 12]}{root // 12 - 1}" if root is not None else None}
    write_json(d / "samples.json", meta)
    return {"id": "lib:" + dest.name, "name": dest.stem, **meta[dest.name]}


def sample_path(f: str) -> Path | None:
    d = (libdir() / "samples").resolve()
    p = (d / f[4:]).resolve()
    return p if d in p.parents and p.exists() else None


def delete_sample(name: str):
    p = sample_path("lib:" + name)
    if p:
        p.unlink()
        d = libdir()
        meta = read_json(d / "samples.json", {})
        meta.pop(p.name, None)
        write_json(d / "samples.json", meta)


def save_preset(kind: str, name: str, data):
    d = libdir()
    pr = read_json(d / "presets.json", {"synth": {}, "fx": {}, "chain": {}})
    pr.setdefault(kind, {})[name.strip()[:60]] = data
    write_json(d / "presets.json", pr)
    return pr


def delete_preset(kind: str, name: str):
    d = libdir()
    pr = read_json(d / "presets.json", {"synth": {}, "fx": {}, "chain": {}})
    pr.get(kind, {}).pop(name, None)
    write_json(d / "presets.json", pr)
    return pr


AUTO_EVERY = 600
AUTO_KEEP = 15


def _snapdir(pdir: Path) -> Path:
    d = pdir / "snapshots"
    d.mkdir(exist_ok=True)
    return d


def snapshots(pdir: Path) -> list[dict]:
    out = []
    for f in sorted(_snapdir(pdir).glob("*.json"), reverse=True):
        j = read_json(f, None)
        if not j:
            continue
        mix = j.get("mix") or {}
        clips = sum(len(t.get("clips", [])) for t in (mix.get("tracks") or {}).values())
        fx = sum(len(t.get("fx", [])) for t in (mix.get("tracks") or {}).values())
        out.append({"id": f.stem, "label": j.get("label", ""), "time": j.get("time", ""), "auto": j.get("auto", False),
                    "stats": {"tracks": len(mix.get("tracks") or {}), "clips": clips, "fx": fx,
                              "gens": len(mix.get("gens") or []), "clones": len(mix.get("clones") or [])}})
    return out


def snapshot(pdir: Path, label: str, auto: bool = False) -> dict | None:
    mix = read_json(pdir / "mix.json", None)
    if not mix:
        return None
    p = read_json(pdir / "project.json", {})
    sid = time.strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:4]
    write_json(_snapdir(pdir) / f"{sid}.json", {"label": label or "Знімок", "time": time.strftime("%Y-%m-%d %H:%M"),
                                                "auto": auto, "mix": mix, "settings": p.get("settings")}, None)
    if auto:
        autos = [f for f in sorted(_snapdir(pdir).glob("*.json")) if (read_json(f, {}) or {}).get("auto")]
        for f in autos[:-AUTO_KEEP]:
            f.unlink(missing_ok=True)
    return {"id": sid}


def maybe_auto_snapshot(pdir: Path):
    d = _snapdir(pdir)
    last = 0.0
    for f in d.glob("*.json"):
        last = max(last, f.stat().st_mtime)
    if time.time() - last > AUTO_EVERY and (pdir / "mix.json").exists():
        snapshot(pdir, "Автозбереження", auto=True)


def restore_snapshot(pdir: Path, sid: str) -> bool:
    f = _snapdir(pdir) / f"{Path(sid).name}.json"
    j = read_json(f, None)
    if not j:
        return False
    snapshot(pdir, "Перед відновленням")
    write_json(pdir / "mix.json", j["mix"], None)
    if j.get("settings"):
        p = read_json(pdir / "project.json")
        p["settings"] = j["settings"]
        write_json(pdir / "project.json", p)
    return True


def delete_snapshot(pdir: Path, sid: str):
    (_snapdir(pdir) / f"{Path(sid).name}.json").unlink(missing_ok=True)


def add_recording(pid: str, src: Path, start: float, name: str, kind: str, transcribe: bool, progress=None) -> dict:
    import soundfile as sf

    pdir = P.workspace() / pid
    p = P.load_project(pid)
    sr = int(p.get("sr", 44100))
    first = pdir / "stems" / f"{p['tracks'][0]['id']}.wav" if p["tracks"] else None
    L = sf.info(str(first)).frames if first is not None and first.exists() else int(p["duration"] * sr)
    y, _ = P.load_audio(src, sr)
    if y.shape[0] == 1:
        y = np.concatenate([y, y])
    y = y[:2]
    off = int(round(start * sr))
    if off < 0:
        y = y[:, -off:]
        off = 0
    if p.get("mode") == "scratch" and off + y.shape[1] > L:
        L = off + y.shape[1]
        p["duration"] = max(float(p["duration"]), L / sr)
    out = np.zeros((2, L), np.float32)
    n = max(0, min(y.shape[1], L - off))
    out[:, off: off + n] = y[:, :n]
    if kind not in separation.STEM_INFO:
        kind = "vocals"
    title_k, role, program, color = separation.STEM_INFO[kind]
    tid = "rec_" + time.strftime("%H%M%S") + uuid.uuid4().hex[:3]
    count = len([t for t in p["tracks"] if t.get("recorded")]) + 1
    P.save_wav(pdir / "stems" / f"{tid}.wav", out, sr)
    P.save_wav(pdir / "preview" / f"{tid}.wav", P.to_mono_sr(out, sr)[None], P.ANALYSIS_SR, "PCM_16")
    t = {"id": tid, "kind": kind, "name": (name or f"Запис {count}").strip()[:60], "role": role if transcribe else "skip",
         "program": program, "color": "#ec4899" if kind == "vocals" else "#a3e635", "source": tid, "level_db": None,
         "quiet": False, "recorded": True}
    if transcribe and role != "skip":
        P.transcribe_track(pdir, t, out, sr, None, progress)
    dur = p["duration"]
    p = P.load_project(pid)
    p["duration"] = max(float(p["duration"]), float(dur))
    p["tracks"].append(t)
    P.save_project(p)
    P.build(pid)
    return {"track": tid}


def delete_recording(pid: str, tid: str) -> bool:
    pdir = P.workspace() / pid
    p = P.load_project(pid)
    t = next((x for x in p["tracks"] if x["id"] == tid and x.get("recorded")), None)
    if not t:
        return False
    p["tracks"] = [x for x in p["tracks"] if x["id"] != tid]
    p["settings"].get("tracks", {}).pop(tid, None)
    P.save_project(p)
    for f in [pdir / "stems" / f"{tid}.wav", pdir / "preview" / f"{tid}.wav"] + list((pdir / "cache").glob(f"{tid}_*")):
        f.unlink(missing_ok=True)
    P.build(pid)
    return True


def _pv(y: np.ndarray, rate: float, n_fft: int = 4096, hop: int = 1024) -> np.ndarray:
    C, N = y.shape
    win = np.hanning(n_fft + 1)[:-1].astype(np.float64)
    yp = np.pad(y, ((0, 0), (n_fft, n_fft)))
    ha = hop * rate
    n_frames = int((yp.shape[1] - n_fft) / ha)
    pos = np.round(np.arange(n_frames) * ha).astype(int)
    K = n_fft // 2 + 1
    omega = 2 * np.pi * np.arange(K) / n_fft
    out = np.zeros((C, n_frames * hop + n_fft))
    norm = np.zeros(n_frames * hop + n_fft)
    w2 = win ** 2
    prev_ph = None
    syn = None
    bins = np.arange(K)
    for i, p0 in enumerate(pos):
        fr = yp[:, p0: p0 + n_fft] * win
        X = np.fft.rfft(fr, axis=1)
        M = X.sum(axis=0)
        mag = np.abs(M)
        ph = np.angle(M)
        if prev_ph is None:
            syn = ph.copy()
        else:
            dha = p0 - pos[i - 1]
            dphi = ph - prev_ph - omega * dha
            dphi -= 2 * np.pi * np.round(dphi / (2 * np.pi))
            inst = omega + dphi / max(dha, 1)
            adv = syn + inst * hop
            pk = np.nonzero((mag[2:-2] > mag[1:-3]) & (mag[2:-2] >= mag[3:-1]) & (mag[2:-2] > mag[:-4]) & (mag[2:-2] >= mag[4:]))[0] + 2
            if len(pk):
                mids = (pk[1:] + pk[:-1]) / 2.0
                owner = pk[np.searchsorted(mids, bins)]
                syn = adv[owner] + (ph - ph[owner])
            else:
                syn = adv
        prev_ph = ph
        rot = np.exp(1j * (syn - ph))
        Y = X * rot[None, :]
        o = i * hop
        out[:, o: o + n_fft] += np.fft.irfft(Y, n=n_fft, axis=1) * win
        norm[o: o + n_fft] += w2
    out /= np.maximum(norm, 1e-3)
    s = int(round(n_fft / rate))
    L = int(round(N / rate))
    return out[:, s: s + L] if out.shape[1] >= s + L else np.pad(out[:, s:], ((0, 0), (0, max(0, L - out.shape[1] + s))))


def _ola(y: np.ndarray, rate: float, n: int = 512) -> np.ndarray:
    C, N = y.shape
    hs = n // 2
    win = np.hanning(n + 1)[:-1]
    L = int(round(N / rate))
    frames = L // hs + 2
    yp = np.pad(y, ((0, 0), (0, n * 2)))
    out = np.zeros((C, frames * hs + n))
    norm = np.zeros(frames * hs + n)
    for i in range(frames):
        a = int(round(i * hs * rate))
        if a + n > yp.shape[1]:
            break
        out[:, i * hs: i * hs + n] += yp[:, a: a + n] * win
        norm[i * hs: i * hs + n] += win
    out /= np.maximum(norm, 1e-3)
    return out[:, :L]


def tsm(y: np.ndarray, rate: float) -> np.ndarray:
    import librosa

    if abs(rate - 1) < 1e-4:
        return y.copy()
    y = np.atleast_2d(y).astype(np.float64)
    H = []
    for ch in y:
        D = librosa.stft(ch, n_fft=2048, hop_length=512)
        h, _ = librosa.decompose.hpss(D, kernel_size=(17, 17), margin=1.0)
        H.append(librosa.istft(h, hop_length=512, length=len(ch)))
    yh = np.array(H)
    yp = y - yh
    a = _pv(yh, rate)
    b = _ola(yp, rate)
    L = min(a.shape[1], b.shape[1])
    return (a[:, :L] + b[:, :L]).astype(np.float32)


def stretch_shift(y: np.ndarray, sr: int, rate: float, semis: float) -> np.ndarray:
    import librosa

    if abs(semis) < 1e-3:
        return tsm(y, rate)
    f = 2 ** (semis / 12)
    z = tsm(y, rate / f)
    z = librosa.resample(z, orig_sr=sr * f, target_sr=sr, axis=-1, res_type="soxr_hq")
    return z.astype(np.float32)


def prepare_transform(job, log):
    import soundfile as sf

    spec = job.transform
    pid = spec["pid"]
    pdir = P.workspace() / pid
    p = P.load_project(pid)
    mix = read_json(pdir / "mix.json", {}) or {}
    b = read_json(pdir / "build.json", {}) or {}
    bpm = float((b.get("timing") or {}).get("bpm") or p["analysis"]["grid"]["bpm"])
    target = float(spec.get("bpm") or bpm)
    rate = max(0.5, min(2.0, target / bpm))
    semis = int(spec.get("semis", 0))
    out = P.workspace() / "_uploads" / ("tr-" + uuid.uuid4().hex[:8])
    out.mkdir(parents=True, exist_ok=True)
    kinds = {}
    tracks = [t for t in p["tracks"] if not ((p["settings"].get("tracks") or {}).get(t["id"]) or {}).get("removed")]
    for i, t in enumerate(tracks):
        if job.cancel:
            raise P.Cancelled()
        src = pdir / "stems" / f"{t['id']}.wav"
        vs = ((mix.get("tracks") or {}).get(t["id"]) or {}).get("source")
        if spec.get("use_edits", True) and vs and (pdir / "versions" / f"{vs}.wav").exists():
            src = pdir / "versions" / f"{vs}.wav"
        y, sr = P.load_audio(src)
        drumsy = t["kind"] in ("drums", "percussion")
        log(f"{t['name']}: {'темп' if drumsy or not semis else 'темп і висота'}…")
        z = stretch_shift(y, sr, rate, 0 if drumsy else semis)
        name = f"{i + 1:02d} {P.slugify(t['name'])}.wav"
        sf.write(str(out / name), z.T, sr, subtype="PCM_24")
        kinds[name] = t["kind"]
        job.progress = 0.02 + 0.25 * (i + 1) / len(tracks)
    keyname = spec.get("key_name") or ""
    suffix = []
    if abs(target - bpm) > 0.05:
        suffix.append(f"{target:g} BPM")
    if semis:
        suffix.append(keyname or (f"+{semis}" if semis > 0 else str(semis)))
    job.title = f"{p['title']} - {' - '.join(suffix)}" if suffix else f"{p['title']} - копія"
    spec["rate"] = rate
    spec["semis"] = semis
    job.inputs = [str(out)]
    job.mode = "stems"
    job.forced_kinds = kinds
    return out


def create_empty(title: str, bpm: float, bpb: int, tonic: int, mode: str, bars: int) -> str:
    bpm = float(min(260.0, max(40.0, bpm or 120.0)))
    bpb = int(bpb) if int(bpb or 4) in (2, 3, 4, 5, 6, 7) else 4
    bars = int(min(512, max(4, bars or 64)))
    tonic = int(tonic or 0) % 12
    mode = "minor" if mode == "minor" else "major"
    title = P.slugify((title or "").strip() or "Новий трек")
    pid = time.strftime("%Y%m%d-%H%M%S") + "-" + re.sub(r"\W+", "-", title.lower(), flags=re.UNICODE)[:30]
    pdir = P.workspace() / pid
    for sub in ("stems", "preview", "cache"):
        (pdir / sub).mkdir(parents=True, exist_ok=True)
    period = 60.0 / bpm
    duration = bars * bpb * period
    beats = [round(i * period, 6) for i in range(int(bars * bpb) + 1)]
    name = f"{harmony.NOTE_NAMES[tonic]} {mode}"
    settings = json.loads(json.dumps(P.DEFAULT_SETTINGS))
    settings["beats_per_bar"] = bpb
    project = {
        "version": P.VERSION, "id": pid, "title": title, "created": time.strftime("%Y-%m-%d %H:%M"),
        "mode": "scratch", "model": None, "sources": [], "sr": 44100, "duration": duration, "tracks": [],
        "analysis": {"grid": {"bpm": bpm, "beat0": 0.0, "beats": beats, "confidence": 1.0}, "downbeat": 0,
                     "key": {"tonic": tonic, "mode": mode, "name": name, "confidence": 1.0},
                     "chords": [], "sections": []},
        "settings": settings,
    }
    write_json(pdir / "project.json", project)
    try:
        P.prepare_kit(pid)
    except Exception:
        pass
    P.build(pid)
    return pid


def analyze_library() -> dict:
    from .creative import estimate_bpm, estimate_key

    d = libdir()
    meta = read_json(d / "samples.json", {})
    changed = 0
    for name, m in meta.items():
        if "bpm" in m and "key" in m:
            continue
        f = d / "samples" / name
        if not f.exists():
            continue
        try:
            y, sr = P.load_audio(f, 22050)
            dur = y.shape[1] / sr
            m["bpm"] = round(float(estimate_bpm(y, sr)), 1) if dur >= 1.5 else None
            m["key"] = estimate_key(y, sr) if dur >= 0.4 else None
        except Exception:
            m["bpm"], m["key"] = None, None
        changed += 1
    if changed:
        write_json(d / "samples.json", meta)
    return meta


def fit_sample(name: str, factor: float, semis: float) -> bytes:
    import io

    import soundfile as sf

    from .creative import _stretch_hq

    f = sample_path(name)
    if not f:
        raise FileNotFoundError(name)
    y, sr = P.load_audio(f, 44100)
    if abs(factor - 1) > 1e-3 or abs(semis) > 1e-3:
        y = _stretch_hq(y, sr, factor, semis)
    pk = float(np.abs(y).max()) if y.size else 0
    if pk > 0.999:
        y = y * (0.999 / pk)
    buf = io.BytesIO()
    sf.write(buf, np.atleast_2d(y).T, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()
