from __future__ import annotations

import json
import math
import re
import shutil
import time
import traceback
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from . import cleanup, drums, harmony, midi_export, rhythm, samples, separation, sound, structure
from .jsonio import read_json, write_json
from .transcribe import Note, Transcriber

VERSION = "1.2.0"
ANALYSIS_SR = 22050

GRIDS = {"off": 0, "1/4": 1.0, "1/8": 0.5, "1/16": 0.25, "1/32": 0.125, "1/8T": 1 / 3, "1/16T": 1 / 6}

DEFAULT_SETTINGS = {
    "bpm": None,
    "beat_offset_ms": 0.0,
    "downbeat": None,
    "beats_per_bar": 4,
    "align_to_bar": True,
    "grid": "1/16",
    "quantize": 0.6,
    "quantize_ends": False,
    "scale_snap": False,
    "chords_track": True,
    "split_drums": True,
    "key_override": None,
    "tracks": {},
}


def workspace() -> Path:
    docs = Path.home() / "Documents"
    base = docs if docs.exists() else Path.home()
    root = base / "InkBeat Projects"
    legacy = base / "Rozbir Projects"
    if not root.exists() and legacy.exists():
        try:
            legacy.rename(root)
        except OSError:
            return legacy
    root.mkdir(parents=True, exist_ok=True)
    return root


def slugify(s: str) -> str:
    s = re.sub(r"[^\w\-. ]+", "", s, flags=re.UNICODE).strip()
    return re.sub(r"\s+", " ", s)[:60] or "song"


def load_audio(path: Path, sr: int | None = None, mono: bool = False):
    import soundfile as sf

    try:
        data, fsr = sf.read(str(path), dtype="float32", always_2d=True)
        y = data.T
    except Exception:
        import librosa

        y, fsr = librosa.load(str(path), sr=None, mono=False)
        y = np.atleast_2d(y).astype(np.float32)
    if mono:
        y = y.mean(axis=0, keepdims=True)
    if sr and fsr != sr:
        import librosa

        y = librosa.resample(y, orig_sr=fsr, target_sr=sr, axis=-1)
        fsr = sr
    return y.astype(np.float32), fsr


def save_wav(path: Path, y: np.ndarray, sr: int, subtype: str = "PCM_24"):
    import soundfile as sf

    path.parent.mkdir(parents=True, exist_ok=True)
    y = np.atleast_2d(y)
    peak = float(np.max(np.abs(y))) if y.size else 0.0
    if peak > 0.999:
        y = y * (0.999 / peak)
    sf.write(str(path), y.T, sr, subtype=subtype)


def to_mono_sr(y: np.ndarray, sr: int, target: int = ANALYSIS_SR) -> np.ndarray:
    import librosa

    m = np.atleast_2d(y).mean(axis=0)
    return librosa.resample(m, orig_sr=sr, target_sr=target) if sr != target else m


@dataclass
class Job:
    id: str
    inputs: list[str]
    mode: str = "auto"
    model: str = "6"
    title: str | None = None
    status: str = "queued"
    stage: str = ""
    progress: float = 0.0
    log: list[str] = field(default_factory=list)
    project_id: str | None = None
    error: str | None = None
    started: float = 0.0
    cancel: bool = False

    def say(self, msg: str):
        self.log.append(f"{time.strftime('%H:%M:%S')}  {msg}")
        self.log = self.log[-200:]

    def public(self):
        return {"id": self.id, "status": self.status, "stage": self.stage, "progress": round(self.progress, 4),
                "log": self.log[-40:], "project_id": self.project_id, "error": self.error,
                "elapsed": round(time.time() - self.started, 1) if self.started else 0}


class Cancelled(Exception):
    pass


STAGES = [
    ("load", "Завантаження аудіо", 0.03, 0.05),
    ("separate", "Розділення на доріжки", 0.47, 0.0),
    ("rhythm", "Темп, сітка і сильні долі", 0.05, 0.08),
    ("harmony", "Тональність і акорди", 0.05, 0.08),
    ("structure", "Структура пісні", 0.04, 0.06),
    ("transcribe", "Переведення доріжок у ноти", 0.31, 0.63),
    ("kit", "Семпли і звук для FL Studio", 0.04, 0.08),
    ("build", "Збирання MIDI-проєкту", 0.03, 0.06),
]


def _stage_runner(job: Job, mix_mode: bool):
    weights = {k: (wm if mix_mode else ws) for k, _, wm, ws in STAGES}
    labels = {k: l for k, l, _, _ in STAGES}
    order = [k for k, *_ in STAGES]
    total = sum(weights.values())

    def run(key):
        base = sum(weights[k] for k in order[: order.index(key)]) / total
        w = weights[key] / total
        job.stage = labels[key]
        job.progress = base
        job.say(labels[key] + "…")

        def prog(frac):
            if job.cancel:
                raise Cancelled()
            job.progress = base + w * float(np.clip(frac, 0, 1))

        return prog

    return run


def analyze(job: Job) -> str:
    job.status = "running"
    job.started = time.time()
    inputs = [Path(p) for p in job.inputs]
    files = separation.collect_stem_files(inputs)
    if not files:
        raise ValueError("Не знайдено жодного аудіофайлу (підтримуються WAV, MP3, FLAC, OGG, M4A, AIFF).")
    mode = job.mode
    if mode == "auto":
        mode = "stems" if len(files) > 1 else "mix"
    mix_mode = mode == "mix"
    stage = _stage_runner(job, mix_mode)

    title = job.title or (files[0][0].stem if mix_mode else (inputs[0].stem if inputs[0].is_dir()
                                                              else files[0][0].stem.split(" - ")[0]))
    title = slugify(title)
    pid = time.strftime("%Y%m%d-%H%M%S") + "-" + re.sub(r"\W+", "-", title.lower(), flags=re.UNICODE)[:30]
    pdir = workspace() / pid
    (pdir / "stems").mkdir(parents=True, exist_ok=True)
    (pdir / "preview").mkdir(exist_ok=True)
    (pdir / "cache").mkdir(exist_ok=True)
    job.project_id = pid

    prog = stage("load")
    SR = 44100
    stems: dict[str, np.ndarray] = {}
    kinds: dict[str, str] = {}
    if mix_mode:
        src = files[0][0]
        job.say(f"Файл: {src.name}")
        mix, _ = load_audio(src, SR)
        if mix.shape[0] == 1:
            mix = np.concatenate([mix, mix])
        mix = mix[:2]
        prog(1)
        prog = stage("separate")
        sep, msr = separation.separate(mix, SR, job.model, progress=prog, log=job.say)
        name_map = {"vocals": "vocals", "drums": "drums", "bass": "bass", "guitar": "guitar", "piano": "piano",
                    "other": "other"}
        for k, y in sep.items():
            kind = name_map.get(k, "other")
            stems[k] = y
            kinds[k] = kind
        sr = msr
    else:
        sr = SR
        for i, (f, kind) in enumerate(files):
            y, _ = load_audio(f, SR)
            if y.shape[0] == 1:
                y = np.concatenate([y, y])
            base = re.sub(r"\W+", "_", f.stem.lower(), flags=re.UNICODE).strip("_") or f"stem{i}"
            key = base
            n = 2
            while key in stems:
                key = f"{base}_{n}"
                n += 1
            stems[key] = y[:2]
            kinds[key] = kind
            job.say(f"Доріжка «{f.name}» → {separation.STEM_INFO[kind][0]}")
            prog((i + 1) / len(files))
        L = max(y.shape[1] for y in stems.values())
        for k in stems:
            if stems[k].shape[1] < L:
                stems[k] = np.pad(stems[k], ((0, 0), (0, L - stems[k].shape[1])))
        mix = sum(stems.values())

    peak_all = max(float(np.max(np.abs(y))) for y in stems.values()) + 1e-9
    tracks = []
    order = ["vocals", "backing", "drums", "percussion", "bass", "guitar", "piano", "synth", "strings", "brass",
             "woodwinds", "pad", "other", "fx"]
    for k in sorted(stems, key=lambda k: (order.index(kinds[k]) if kinds[k] in order else 99, k)):
        y = stems[k]
        rms = float(np.sqrt(np.mean(y ** 2)))
        if rms < 0.004 * peak_all:
            job.say(f"Доріжка «{k}» майже порожня — пропускаю.")
            continue
        title_k, role, program, color = separation.STEM_INFO[kinds[k]]
        level_db = 20 * np.log10(rms / (max(float(np.sqrt(np.mean(v ** 2))) for v in stems.values()) + 1e-9) + 1e-9)
        if not mix_mode and len([1 for t in tracks if t["kind"] == kinds[k]]) > 0:
            title_k = f"{title_k} {len([1 for t in tracks if t['kind'] == kinds[k]]) + 1}"
        tid = re.sub(r"\W+", "_", k)
        save_wav(pdir / "stems" / f"{tid}.wav", y, sr)
        save_wav(pdir / "preview" / f"{tid}.wav", to_mono_sr(y, sr)[None], ANALYSIS_SR, "PCM_16")
        tracks.append({"id": tid, "kind": kinds[k], "name": title_k, "role": role, "program": program,
                       "color": color, "source": k, "level_db": round(float(level_db), 1),
                       "quiet": bool(level_db < -26)})
        if level_db < -26:
            job.say(f"Доріжка «{title_k}» дуже тиха ({level_db:.0f} дБ) — MIDI для неї вимкнено за замовчуванням.")
    save_wav(pdir / "preview" / "_mix.wav", to_mono_sr(mix, sr)[None], ANALYSIS_SR, "PCM_16")
    duration = mix.shape[1] / sr

    def mono22(kind_set=None, ids=None, exclude=()):
        sel = [t for t in tracks if (kind_set is None or t["kind"] in kind_set)
               and (ids is None or t["id"] in ids) and t["kind"] not in exclude]
        if not sel:
            return None
        return sum(to_mono_sr(stems[t["source"]], sr) for t in sel)

    mix22 = to_mono_sr(mix, sr)

    prog = stage("rhythm")
    import librosa

    perc = mono22({"drums", "percussion"})
    if perc is None or np.sqrt(np.mean(perc ** 2)) < 0.01 * np.sqrt(np.mean(mix22 ** 2)):
        job.say("Окремих барабанів немає — шукаю ритм у повному міксі.")
        perc = librosa.effects.percussive(mix22)
    prog(0.2)
    grid = rhythm.estimate_grid(perc, ANALYSIS_SR)
    prog(0.7)
    low = mono22({"drums", "percussion", "bass"})
    harm = mono22(exclude=("drums", "percussion", "vocals", "fx"))
    if harm is None:
        harm = librosa.effects.harmonic(mix22)
    downbeat = rhythm.estimate_downbeat(grid["beats"], ANALYSIS_SR, low, harm, 4)
    job.say(f"Темп: {grid['bpm']:.2f} BPM (впевненість {grid['confidence'] * 100:.0f}%), "
            f"перша сильна доля: {grid['beats'][downbeat]:.2f} с")
    prog(1)

    prog = stage("harmony")
    ch = harmony.chroma_of(harm, ANALYSIS_SR)
    prog(0.4)
    key = harmony.detect_key(ch)
    beats_arr = np.array(grid["beats"])
    bf = librosa.time_to_frames(beats_arr, sr=ANALYSIS_SR, hop_length=512)
    bass = mono22({"bass"})
    bch = librosa.feature.chroma_cqt(y=bass, sr=ANALYSIS_SR, hop_length=512) if bass is not None else None
    segs = harmony.detect_chords(ch, bch, bf, key)
    rms = librosa.feature.rms(y=harm, hop_length=512)
    brms = harmony.beat_sync(rms, bf)[0]
    thr = np.percentile(brms, 90) * 0.05
    for s in segs:
        if brms[s["start_beat"]: s["end_beat"]].mean() < thr:
            s.update(label="N", root=None, kind=None)
    segs = _merge_chords(segs)
    key = harmony.refine_key_with_chords(key, segs)
    job.say(f"Тональність: {key['name']}; акордів: {len([s for s in segs if s['label'] != 'N'])}")
    prog(1)

    prog = stage("structure")
    vocal = mono22({"vocals"})
    try:
        sections = structure.segment(mix22, ANALYSIS_SR, beats_arr, downbeat, 4, vocal)
    except Exception as e:
        job.say(f"Структуру визначити не вдалося ({e}); вся пісня — одна секція.")
        sections = [{"start_bar": 0, "end_bar": max(1, (len(beats_arr) - downbeat) // 4), "group": "A",
                     "kind": "verse", "name": "Song", "name_ua": "Пісня", "color": "#3b82f6"}]
    job.say("Структура: " + " → ".join(s["name_ua"] for s in sections))
    prog(1)

    prog = stage("transcribe")
    tr = Transcriber()
    melodic = [t for t in tracks if t["role"] not in ("drums", "skip")]
    n_jobs = max(1, len(melodic) + len([t for t in tracks if t["role"] == "drums"]))
    done = 0
    for t in tracks:
        if t["role"] == "skip":
            continue
        y22 = to_mono_sr(stems[t["source"]], sr)
        if t["role"] == "drums":
            job.say(f"Барабани → MIDI: {t['name']}")
            y44 = np.atleast_2d(stems[t["source"]]).mean(axis=0)
            ev = drums.transcribe_drums(y44, sr)
            write_json(pdir / "cache" / f"{t['id']}_drums.json", ev, None)
            t["raw_count"] = len(ev)
        else:
            job.say(f"Ноти: {t['name']}")
            acts = tr.activations(y22, progress=lambda f, d=done: prog((d + f * 0.9) / n_jobs))
            np.savez_compressed(pdir / "cache" / f"{t['id']}_acts.npz", **acts)
            ons = librosa.onset.onset_detect(y=y22, sr=ANALYSIS_SR, hop_length=128, units="time", backtrack=True)
            np.save(pdir / "cache" / f"{t['id']}_onsets.npy", ons)
            env = librosa.feature.rms(y=y22, hop_length=256)[0]
            np.save(pdir / "cache" / f"{t['id']}_rms.npy", env.astype(np.float32))
            E = np.abs(librosa.cqt(y22, sr=ANALYSIS_SR, hop_length=256, fmin=27.5, n_bins=88,
                                   bins_per_octave=12))
            np.save(pdir / "cache" / f"{t['id']}_pitchE.npy", E.astype(np.float16))
        done += 1
        prog(done / n_jobs)

    project = {
        "version": VERSION, "id": pid, "title": title, "created": time.strftime("%Y-%m-%d %H:%M"),
        "mode": mode, "model": job.model if mix_mode else None, "sources": [str(p) for p in inputs],
        "sr": sr, "duration": duration, "tracks": tracks,
        "analysis": {"grid": grid, "downbeat": downbeat, "key": key, "chords": segs, "sections": sections},
        "settings": json.loads(json.dumps(DEFAULT_SETTINGS)),
    }
    write_json(pdir / "project.json", project)

    prog = stage("kit")
    try:
        kit = prepare_kit(pid, progress=prog)
        job.say(f"Семпли: {sum(len(t['samples']) for t in kit['tracks'])} файлів; звукові рекомендації готові.")
    except Exception as e:
        job.say(f"Семпли не вдалося підготувати ({e}) — MIDI та стеми не постраждали.")

    prog = stage("build")
    build(pid)
    prog(1)
    job.progress = 1.0
    job.stage = "Готово"
    job.say(f"Готово за {time.time() - job.started:.0f} с.")
    job.status = "done"
    return pid


def _merge_chords(segs):
    out = []
    for s in segs:
        if out and out[-1]["label"] == s["label"]:
            out[-1]["end_beat"] = s["end_beat"]
        else:
            out.append(dict(s))
    return out


_notes_cache: dict = {}


def load_project(pid: str) -> dict:
    p = read_json(workspace() / pid / "project.json")
    if p is None:
        raise FileNotFoundError(f"project.json пошкоджено або відсутній: {pid}")
    return p


def save_project(p: dict):
    write_json(workspace() / p["id"] / "project.json", p)


def list_projects() -> list[dict]:
    out = []
    for d in sorted(workspace().iterdir(), reverse=True):
        f = d / "project.json"
        if f.exists():
            try:
                p = read_json(f)
                out.append({"id": p["id"], "title": p["title"], "created": p["created"],
                            "bpm": p["analysis"]["grid"]["bpm"], "key": p["analysis"]["key"]["name"],
                            "tracks": len(p["tracks"]), "duration": p["duration"]})
            except Exception:
                pass
    return out


def track_settings(p: dict, tid: str) -> dict:
    t = next(x for x in p["tracks"] if x["id"] == tid)
    from .transcribe import PROFILES

    prof = PROFILES.get(t["role"], PROFILES["poly"])
    base = {"enabled": t["role"] != "skip" and not t.get("quiet"), "sensitivity": 0.5, "min_ms": prof["min_ms"] if t["role"] != "drums" else 0,
            "mono": prof["mono"] if t["role"] != "drums" else False, "octave": 0, "velocity": "dynamic",
            "program": t["program"], "name": t["name"]}
    base.update(p["settings"].get("tracks", {}).get(tid, {}))
    return base


def timing(p: dict) -> dict:
    a, s = p["analysis"], p["settings"]
    g = a["grid"]
    bpm = float(s.get("bpm") or g["bpm"])
    period = 60.0 / bpm
    bpb = int(s.get("beats_per_bar") or 4)
    beat0 = g["beat0"] + float(s.get("beat_offset_ms") or 0) / 1000.0
    if s.get("bpm") and abs(bpm - g["bpm"]) > 1e-6:
        anchor = g["beat0"] + a["downbeat"] * 60.0 / g["bpm"]
        beat0 = anchor % period + float(s.get("beat_offset_ms") or 0) / 1000.0
    db_phase = s.get("downbeat")
    if db_phase is None:
        db_phase = a["downbeat"] % bpb
    first_down = beat0 + (int(db_phase) % bpb) * period
    bar_len = bpb * period
    first_down = first_down % bar_len
    pad = ((-first_down) % bar_len) if s.get("align_to_bar", True) else 0.0
    if pad > bar_len - 1e-4:
        pad = 0.0
    return {"bpm": bpm, "period": period, "bpb": bpb, "pad": pad, "first_down": first_down,
            "beat0": beat0, "bar_len": bar_len, "downbeat_phase": int(db_phase) % bpb,
            "detected_bpm": g["bpm"], "detected_downbeat": a["downbeat"] % bpb}


def sec_to_beat(t: float, tm: dict) -> float:
    return (t + tm["pad"]) / tm["period"]


def grid_beat_to_flbeat(i: int, p: dict, tm: dict) -> float:
    g = p["analysis"]["grid"]
    t = g["beat0"] + i * 60.0 / g["bpm"]
    return sec_to_beat(t, tm)


def build(pid: str, settings_patch: dict | None = None) -> dict:
    p = load_project(pid)
    if settings_patch:
        tracks_patch = settings_patch.pop("tracks", None)
        p["settings"].update(settings_patch)
        if tracks_patch:
            for tid, v in tracks_patch.items():
                p["settings"].setdefault("tracks", {}).setdefault(tid, {}).update(v)
        save_project(p)
    pdir = workspace() / pid
    s = p["settings"]
    tm = timing(p)
    grid = GRIDS.get(s.get("grid", "1/16"), 0.25)
    qs = float(s.get("quantize", 0.6))
    key = dict(p["analysis"]["key"])
    ko = s.get("key_override")
    if ko and "tonic" in ko:
        key.update(tonic=int(ko["tonic"]) % 12, mode=ko.get("mode", "major"),
                   name=f"{harmony.NOTE_NAMES[int(ko['tonic']) % 12]} {ko.get('mode', 'major')}", manual=True)
    pcs = cleanup.scale_pcs(key["tonic"], key["mode"])
    end_beat = sec_to_beat(p["duration"], tm)
    out_tracks = []

    for t in p["tracks"]:
        ts = track_settings(p, t["id"])
        notes_b = []
        if t["role"] == "skip":
            pass
        elif t["role"] == "drums":
            f = pdir / "cache" / f"{t['id']}_drums.json"
            if abs(ts["sensitivity"] - 0.5) > 1e-3:
                ck = (pid, t["id"], "drums", round(ts["sensitivity"], 3))
                if ck not in _notes_cache:
                    y, sr = load_audio(pdir / "stems" / f"{t['id']}.wav", mono=True)
                    _notes_cache[ck] = drums.transcribe_drums(y[0], sr, ts["sensitivity"])
                ev = _notes_cache[ck]
            else:
                ev = read_json(f, [])
            for e in ev:
                b = cleanup.quantize_beats(sec_to_beat(e["t"], tm), grid, qs)
                vel = e["vel"] if ts["velocity"] == "dynamic" else 100
                notes_b.append([round(b, 5), 0.25 if grid == 0 else min(0.25, grid), e["note"], vel])
        else:
            ck = (pid, t["id"], round(ts["sensitivity"], 3), int(ts["min_ms"]), bool(ts["mono"]))
            if ck not in _notes_cache:
                acts = dict(np.load(pdir / "cache" / f"{t['id']}_acts.npz"))
                onsf = pdir / "cache" / f"{t['id']}_onsets.npy"
                ons = np.load(onsf) if onsf.exists() else None
                raw = Transcriber.notes(acts, t["role"], ts["sensitivity"], ts["min_ms"])
                from .transcribe import PROFILES

                prof = PROFILES.get(t["role"], PROFILES["poly"])
                cleaned = cleanup.process_track(raw, t["role"], ts["mono"], ts["min_ms"] / 1000.0,
                                                prof["poly"] if not ts["mono"] else 1, ons)
                rf = pdir / "cache" / f"{t['id']}_rms.npy"
                if rf.exists():
                    gate_db = -30.0 - (ts["sensitivity"] - 0.5) * 16
                    cleaned = cleanup.loudness_gate(cleaned, np.load(rf), ANALYSIS_SR / 256, gate_db)
                _notes_cache[ck] = cleaned
            notes = _notes_cache[ck]
            for n in notes:
                pitch = n.pitch + 12 * int(ts["octave"])
                if s.get("scale_snap"):
                    pitch = cleanup.snap_to_scale(pitch, pcs)
                a = cleanup.quantize_beats(sec_to_beat(n.start, tm), grid, qs)
                e = sec_to_beat(n.end, tm)
                if s.get("quantize_ends"):
                    e = cleanup.quantize_beats(e, grid, qs)
                min_len = max(grid / 2, 0.06) if grid else 0.06
                ln = max(min_len, e - a)
                vel = cleanup.velocity(n.amp, ts["velocity"])
                notes_b.append([round(a, 5), round(ln, 5), int(pitch), vel])
            notes_b.sort(key=lambda x: (x[0], x[2]))
            if ts["mono"]:
                for i in range(len(notes_b) - 1):
                    nxt = notes_b[i + 1][0]
                    if notes_b[i][0] + notes_b[i][1] > nxt and nxt > notes_b[i][0]:
                        notes_b[i][1] = round(nxt - notes_b[i][0], 5)
                notes_b = [n for n in notes_b if n[1] > 0.02]
            seen = {}
            for n in notes_b:
                k = (round(n[0], 3), n[2])
                if k not in seen or seen[k][3] < n[3]:
                    seen[k] = n
            notes_b = sorted(seen.values(), key=lambda x: (x[0], x[2]))
        out_tracks.append({"id": t["id"], "name": ts["name"], "kind": t["kind"], "role": t["role"],
                           "color": t["color"], "program": ts["program"], "enabled": ts["enabled"],
                           "settings": ts, "notes": notes_b, "is_drums": t["role"] == "drums",
                           "level_db": t.get("level_db"), "has_audio": True})

    _cross_bleed_filter(pid, pdir, p, out_tracks, tm)

    chords = []
    for c in p["analysis"]["chords"]:
        a = grid_beat_to_flbeat(c["start_beat"], p, tm)
        b = grid_beat_to_flbeat(c["end_beat"], p, tm)
        a = cleanup.quantize_beats(a, max(grid, 0.25) if grid else 0, 1.0) if grid else a
        b = cleanup.quantize_beats(b, max(grid, 0.25) if grid else 0, 1.0) if grid else b
        chords.append({"start": round(a, 4), "end": round(b, 4), "label": c["label"], "root": c["root"],
                       "kind": c["kind"]})
    if s.get("chords_track", True):
        cn = []
        for c in chords:
            if c["label"] == "N" or c["end"] - c["start"] <= 0:
                continue
            for pitch in harmony.chord_voicing(c["root"], c["kind"]):
                cn.append([c["start"], round(c["end"] - c["start"], 4), pitch, 90])
        out_tracks.append({"id": "_chords", "name": "Chords (harmony)", "kind": "chords", "role": "pad",
                           "color": "#eab308", "program": 89, "enabled": True,
                           "settings": {"enabled": True}, "notes": cn, "is_drums": False, "virtual": True})

    sections = []
    db_beat = sec_to_beat(tm["first_down"], tm)
    for sec in p["analysis"]["sections"]:
        sections.append({**sec, "start": round(db_beat + sec["start_bar"] * tm["bpb"], 4),
                         "end": round(db_beat + sec["end_bar"] * tm["bpb"], 4)})
    result = {"project": {k: p[k] for k in ("id", "title", "created", "mode", "duration", "version")},
              "timing": tm, "key": key, "detected_key": p["analysis"]["key"], "settings": s,
              "tracks": out_tracks, "chords": chords,
              "sections": sections, "end_beat": end_beat,
              "confidence": {"tempo": p["analysis"]["grid"]["confidence"], "key": key.get("confidence", 0)}}
    write_json(pdir / "build.json", result, None)
    return result


_E_cache: dict = {}


def _cross_bleed_filter(pid, pdir, p, out_tracks, tm, margin_db: float = 10.0):
    mel = [t for t in out_tracks if not t["is_drums"] and t["notes"] and (pdir / "cache" / f"{t['id']}_pitchE.npy").exists()]
    if len(mel) < 2:
        return
    allmel = [t for t in p["tracks"] if t["role"] not in ("drums", "skip")
              and (pdir / "cache" / f"{t['id']}_pitchE.npy").exists()]
    E = {}
    for t in allmel:
        k = (pid, t["id"])
        if k not in _E_cache:
            _E_cache[k] = np.load(pdir / "cache" / f"{t['id']}_pitchE.npy").astype(np.float32)
        E[t["id"]] = _E_cache[k]
    fps = ANALYSIS_SR / 256
    ratio = 10 ** (-margin_db / 20)
    for t in mel:
        mine = E[t["id"]]
        others = [E[o["id"]] for o in allmel if o["id"] != t["id"]]
        keep = []
        for n in t["notes"]:
            start_s = n[0] * tm["period"] - tm["pad"]
            a = max(0, int(start_s * fps))
            b = a + max(2, int(min(n[1] * tm["period"], 0.15) * fps))
            pitch = n[2] - 12 * int(t["settings"].get("octave", 0)) - 21
            if not 0 <= pitch < 88:
                keep.append(n)
                continue
            e_me = float(mine[pitch, a:b].mean()) if mine[pitch, a:b].size else 0.0
            e_ot = max((float(o[pitch, a:b].mean()) if o[pitch, a:b].size else 0.0) for o in others)
            if e_me >= e_ot * ratio:
                keep.append(n)
        t["notes"] = keep


def _sections_sec(p: dict) -> list[tuple[float, float, str]]:
    g, a = p["analysis"]["grid"], p["analysis"]
    per = 60.0 / g["bpm"]
    out = []
    for sct in a["sections"]:
        t0 = g["beat0"] + (a["downbeat"] + sct["start_bar"] * 4) * per
        t1 = g["beat0"] + (a["downbeat"] + sct["end_bar"] * 4) * per
        out.append((t0, t1, sct["name"]))
    return out


def prepare_kit(pid: str, progress=None) -> dict:
    p = load_project(pid)
    pdir = workspace() / pid
    sdir = pdir / "samples"
    if sdir.exists():
        shutil.rmtree(sdir, ignore_errors=True)
    sdir.mkdir(parents=True)
    secs = _sections_sec(p)
    kit_tracks = []
    n = len(p["tracks"])
    insert = 0
    for i, t in enumerate(p["tracks"]):
        y, sr = load_audio(pdir / "stems" / f"{t['id']}.wav")
        insert += 1
        feats = sound.analyze(y, sr)
        rec = sound.recommend(t, feats, insert)
        items = []
        try:
            if t["role"] == "drums":
                f = pdir / "cache" / f"{t['id']}_drums.json"
                ev = read_json(f, [])
                items = samples.drum_hits(y, sr, ev)
                sub = "Drums"
            elif t["role"] == "skip":
                sub = None
            elif t["kind"] in ("vocals", "backing"):
                items = samples.vocal_chops(y, sr, secs)
                sub = "Vocal chops"
                acts = dict(np.load(pdir / "cache" / f"{t['id']}_acts.npz"))
                notes = cleanup.process_track(Transcriber.notes(acts, t["role"]), t["role"], True, 0.09, 1)
                items += samples.melodic_oneshot(y, sr, notes, t["name"], True)[:1]
            else:
                acts = dict(np.load(pdir / "cache" / f"{t['id']}_acts.npz"))
                from .transcribe import PROFILES

                prof = PROFILES.get(t["role"], PROFILES["poly"])
                ons_f = pdir / "cache" / f"{t['id']}_onsets.npy"
                notes = cleanup.process_track(Transcriber.notes(acts, t["role"]), t["role"], prof["mono"],
                                              prof["min_ms"] / 1000, prof["poly"], np.load(ons_f) if ons_f.exists() else None)
                items = samples.melodic_oneshot(y, sr, notes, t["name"], prof["mono"])
                sub = "One-shots"
        except Exception as e:
            items, sub = [], None
            rec.setdefault("notes", []).append(f"семпли: {e}")
        saved = []
        for it in items:
            folder = sdir / (sub if it["kind"] != "oneshot" or sub != "Vocal chops" else "One-shots")
            fname = slugify(it["name"]) + ".wav"
            save_wav(folder / fname, it.pop("audio"), sr)
            it["file"] = str((folder / fname).relative_to(sdir)).replace("\\", "/")
            saved.append(it)
        kit_tracks.append({"id": t["id"], "name": t["name"], "color": t["color"], "role": t["role"], "kind": t["kind"],
                           "insert": insert, "features": feats, "rec": rec, "samples": saved})
        if progress:
            progress((i + 1) / n)
    chords_insert = insert + 1
    chords_rec = sound.recommend({"role": "pad", "kind": "chords", "name": "Chords"},
                                 {"silent": False, "centroid": 1500, "sustain": 0.8, "attack_s": 0.08, "width": 0.4,
                                  "rt60": 1.6, "crest_db": 12, "low_cut": 120, "richness": 0.01}, chords_insert)
    kit = {"tracks": kit_tracks, "chords": {"insert": chords_insert, "rec": chords_rec},
           "buses": [{"insert": chords_insert + 2, "name": "Reverb", "chain": [
                         {"plugin": "Fruity Reeverb 2", "settings": ["Wet 100%, Dry 0%", "Decay 1.6–2.2 с, Low cut 300 Гц"]}]},
                     {"insert": chords_insert + 3, "name": "Delay", "chain": [
                         {"plugin": "Fruity Delay 3", "settings": ["Wet 100%, Dry 0%", "Time 1/4, Feedback 30%, HP 300 Гц"]}]}],
           "master": sound.MASTER_CHAIN}
    write_json(pdir / "kit.json", kit)
    return kit


def get_kit(pid: str) -> dict:
    kit = read_json(workspace() / pid / "kit.json")
    if not kit or "tracks" not in kit:
        return prepare_kit(pid)
    return kit


def _loops(p: dict, b: dict, out: Path):
    tm = b["timing"]
    pdir = workspace() / p["id"]
    bar = tm["bar_len"]
    picks, seen = [], set()
    for sct in b["sections"]:
        if sct["kind"] in seen or sct["kind"] not in ("chorus", "verse", "intro", "bridge", "prechorus"):
            continue
        seen.add(sct["kind"])
        t0 = sct["start"] * tm["period"] - tm["pad"]
        bars = 4 if (sct["end"] - sct["start"]) >= 4 * tm["bpb"] else max(1, int((sct["end"] - sct["start"]) / tm["bpb"]))
        picks.append((sct["name"], t0, bars))
    made = 0
    bpm_txt = f"{tm['bpm']:.0f}" if abs(tm["bpm"] - round(tm["bpm"])) < 0.01 else f"{tm['bpm']:.2f}"
    for t in [x for x in b["tracks"] if not x.get("virtual")]:
        src = pdir / "stems" / f"{t['id']}.wav"
        if not src.exists():
            continue
        y, sr = load_audio(src)
        for name, t0, bars in picks:
            seg = samples.loop(y, sr, t0, bars * bar)
            if seg is not None:
                save_wav(out / f"{slugify(t['name'])} - {name} - {bars} bars - {bpm_txt} BPM.wav", seg, sr)
                made += 1
    return made


DRUM_SPLIT = {"Kick": [36], "Snare & Clap": [38, 39, 40], "Hi-Hats": [42, 44, 46], "Cymbals": [49, 51, 57],
              "Toms": [45, 47, 48, 50]}


def export(pid: str, options: dict | None = None) -> dict:
    options = options or {}
    p = load_project(pid)
    b = build(pid)
    tm = b["timing"]
    pdir = workspace() / pid
    out = pdir / "export" / slugify(f"{p['title']} - InkBeat")
    if out.exists():
        shutil.rmtree(out, ignore_errors=True)
    (out / "MIDI").mkdir(parents=True, exist_ok=True)
    markers = [(sec["start"], sec["name"]) for sec in b["sections"]]
    cond = lambda: midi_export.conductor(tm["bpm"], tm["bpb"], b["key"], markers, p["title"])
    enabled = [t for t in b["tracks"] if t["enabled"] and t["notes"]]
    all_tracks = [cond()]
    files = []
    mel_ch = [c for c in range(16) if c != 9]
    for i, t in enumerate(enabled):
        ch = 9 if t["is_drums"] else mel_ch[i % len(mel_ch)]
        notes = [tuple(n) for n in t["notes"]]
        trk = midi_export.note_track(t["name"], notes, ch, None if t["is_drums"] else t["program"], b["end_beat"])
        all_tracks.append(trk)
        fn = out / "MIDI" / f"{i + 1:02d} {slugify(t['name'])}.mid"
        midi_export.write(fn, [cond(), midi_export.note_track(t["name"], notes, ch,
                                                              None if t["is_drums"] else t["program"],
                                                              b["end_beat"])])
        files.append(str(fn.relative_to(out)))
        if t["is_drums"] and b["settings"].get("split_drums", True):
            for part, nums in DRUM_SPLIT.items():
                sub = [n for n in notes if n[2] in nums]
                if sub:
                    f2 = out / "MIDI" / f"{i + 1:02d} {slugify(t['name'])} - split" / f"{part}.mid"
                    midi_export.write(f2, [cond(), midi_export.note_track(f"{t['name']} {part}", sub, 9, None,
                                                                          b["end_beat"])])
    full = out / f"{slugify(p['title'])} - all tracks.mid"
    midi_export.write(full, all_tracks)

    stems_out = out / "Stems (aligned)"
    pad_n = int(round(tm["pad"] * p["sr"]))
    import soundfile as sf

    mix = None
    for i, t in enumerate([x for x in b["tracks"] if not x.get("virtual")]):
        src = pdir / "stems" / f"{t['id']}.wav"
        if not src.exists():
            continue
        y, sr = sf.read(str(src), dtype="float32", always_2d=True)
        y = np.pad(y, ((pad_n, 0), (0, 0)))
        save_wav(stems_out / f"{i + 1:02d} {slugify(t['name'])}.wav", y.T, sr)
        mix = y if mix is None else mix + (y if len(y) == len(mix) else np.resize(y, mix.shape))
    if mix is not None:
        save_wav(out / "Reference mix (aligned).wav", mix.T, p["sr"])

    rdir = pdir / "render"
    if options.get("use_render") and rdir.exists() and any(rdir.iterdir()):
        shutil.copytree(rdir, out / "Rendered (InkBeat edits)", dirs_exist_ok=True)
    ed = options.get("edited")
    if ed:
        etracks = [cond()]
        for i, t in enumerate(ed):
            ch = 9 if t.get("is_drums") else mel_ch[i % len(mel_ch)]
            notes = [tuple(n) for n in t["notes"]]
            trk = midi_export.note_track(t["name"], notes, ch, None if t.get("is_drums") else t.get("program"),
                                         b["end_beat"])
            etracks.append(trk)
            midi_export.write(out / "MIDI (edited arrangement)" / f"{i + 1:02d} {slugify(t['name'])}.mid",
                              [cond(), midi_export.note_track(t["name"], notes, ch,
                                                              None if t.get("is_drums") else t.get("program"),
                                                              b["end_beat"])])
        midi_export.write(out / f"{slugify(p['title'])} - edited arrangement.mid", etracks)

    kit = get_kit(pid)
    sdir = pdir / "samples"
    if sdir.exists():
        shutil.copytree(sdir, out / "Samples", dirs_exist_ok=True)
    try:
        _loops(p, b, out / "Samples" / "Loops")
    except Exception:
        pass
    from .guide_html import render as render_guide

    (out / "Звуковий гід FL Studio.html").write_text(render_guide(p, b, kit, enabled, files), encoding="utf-8")

    fl_src = Path(__file__).resolve().parent.parent.parent / "fl_scripts"
    for f in fl_src.glob("*.pyscript"):
        shutil.copy(f, out / f.name)
    info = {"title": p["title"], "bpm": tm["bpm"], "time_signature": f"{tm['bpb']}/4", "key": b["key"]["name"],
            "lead_in_seconds": round(tm["pad"], 4),
            "sections": [{"name": s_["name"], "bar": int(round(s_["start"] / tm["bpb"])) + 1} for s_ in b["sections"]],
            "chords": [{"bar": round(c["start"] / tm["bpb"] + 1, 2), "chord": c["label"]} for c in b["chords"]
                       if c["label"] != "N"],
            "tracks": [{"name": t["name"], "notes": len(t["notes"]), "file": f}
                       for t, f in zip(enabled, files)]}
    write_json(out / "song_info.json", info)
    (out / "ЯК ІМПОРТУВАТИ У FL STUDIO.txt").write_text(_guide(p, b, tm, enabled), encoding="utf-8")
    return {"path": str(out), "files": sorted(str(x.relative_to(out)) for x in out.rglob("*") if x.is_file())}


def _guide(p, b, tm, enabled) -> str:
    bars_pad = tm["pad"] / tm["bar_len"]
    chords_line = "  ".join(f"{c['label']}" for c in b["chords"] if c["label"] != "N")[:600]
    tracks_txt = "\n".join(f"   {i + 1:02d}. {t['name']:<22} {len(t['notes']):>5} нот"
                           + ("   (FPC / будь-який драм-кіт — розкладка General MIDI)" if t["is_drums"] else "")
                           for i, t in enumerate(enabled))
    secs = "\n".join(f"   Такт {int(round(s['start'] / tm['bpb'])) + 1:>3}: {s['name_ua']}" for s in b["sections"])
    return f"""INKBEAT → FL STUDIO
========================================
Пісня:        {p['title']}
Темп:         {tm['bpm']:.2f} BPM   (у FL: клацніть на темп угорі й введіть це число)
Розмір:       {tm['bpb']}/4
Тональність:  {b['key']['name']}
Вступ-зсув:   {tm['pad']:.3f} с ({bars_pad:.2f} такту) — щоб перша сильна доля пісні стала точно на початок такту.

ДОРІЖКИ
{tracks_txt}

СТРУКТУРА
{secs}

АКОРДИ
   {chords_line}

----------------------------------------
ШВИДКИЙ СПОСІБ (усе одразу)
1. FL Studio → File → Import → MIDI file… → оберіть «{slugify(p['title'])} - all tracks.mid».
2. У вікні імпорту увімкніть «Start new project» (новий проєкт) — FL візьме темп із файлу
   і створить окремий канал на кожну доріжку (вокал, бас, клавішні, барабани, акорди…).
3. Кожен канал — це звичайні ноти в Piano roll: міняйте інструмент на свій
   (FLEX, Sytrus, Vital, Serum, FPC для барабанів тощо), редагуйте ноти як завгодно.

ТОЧНИЙ СПОСІБ (кожна доріжка окремо)
1. Встановіть темп {tm['bpm']:.2f} BPM.
2. Додайте інструмент у Channel rack → відкрийте його Piano roll →
   меню Piano roll (стрілка зліва вгорі) → File → Import MIDI file… → файл з папки MIDI.
3. Для барабанів: додайте FPC і імпортуйте «Drums.mid» — ноти вже в розкладці General MIDI
   (36 бочка, 38 малий, 42 закритий хет, 46 відкритий, 49 тарілка). Якщо барабани у вас на
   окремих семплах — беріть файли з папки «… - split» (бочка, малий, хети окремо).

ОРИГІНАЛЬНИЙ ЗВУК (для порівняння або щоб залишити вокал)
• Папка «Stems (aligned)» — розділені доріжки у WAV, уже вирівняні під сітку.
  Перетягніть їх у Playlist на самий початок (такт 1) — вони збігатимуться з MIDI.
• «Reference mix (aligned).wav» — увесь мікс для звірки на слух.

ЗВУК, ЕФЕКТИ І СЕМПЛИ (стандартні плагіни FL Studio)
• «Звуковий гід FL Studio.html» — відкрийте в браузері: для кожної доріжки який плагін FL взяти
  (FPC, FLEX, FL Keys, BooBass, Sytrus…), яку категорію пресета, які ефекти на інсерт мікшера
  (Parametric EQ 2, Compressor, Reeverb 2, Delay 3, Stereo Shaper…) і з якими налаштуваннями,
  плюс план мікшера з шинами Reverb/Delay і ланцюжок на Master.
• Samples/Drums — бочка, малий, хети, тарілки, вирізані з вашої пісні → на пади FPC
  (номер пада вказано в гіді; розкладка збігається з MIDI барабанів).
• Samples/One-shots — окремі ноти й акорди з пісні. Перетягніть у Channel rack (створиться Sampler),
  у Channel settings правий клік на клавіші root-ноти з назви файлу — і MIDI заграє цим звуком.
• Samples/Vocal chops — фрази вокалу для чопів.
• Samples/Loops — лупи по 4 такти кожної доріжки, точно в темпі: перетягніть у Playlist.

ДОПОМІЖНИЙ СКРИПТ ДЛЯ PIANO ROLL
«InkBeat Cleanup.pyscript» скопіюйте у:
   Документи\\Image-Line\\FL Studio\\Settings\\Piano roll scripts
Потім у Piano roll: Tools → Scripting → InkBeat Cleanup. Він квантує, прибирає дрібні
й тихі ноти, підтягує ноти до тональності та вирівнює гучність — з ручками-налаштуваннями.

Порада: вокал перетворюється на мелодію (ноти), а не на голос із текстом. Щоб співати по-новому,
залиште вокальний стем як аудіо, або дайте мелодію своєму синту/вокалісту.
"""
