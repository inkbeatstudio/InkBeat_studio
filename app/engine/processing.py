from __future__ import annotations

import json
import time
import uuid
from pathlib import Path

import numpy as np

SCALES = {
    "major": [0, 2, 4, 5, 7, 9, 11], "minor": [0, 2, 3, 5, 7, 8, 10],
    "harmonic_minor": [0, 2, 3, 5, 7, 8, 11], "dorian": [0, 2, 3, 5, 7, 9, 10],
    "mixolydian": [0, 2, 4, 5, 7, 9, 10], "pentatonic_major": [0, 2, 4, 7, 9],
    "pentatonic_minor": [0, 3, 5, 7, 10], "blues": [0, 3, 5, 6, 7, 10], "chromatic": list(range(12)),
}

OPS = {
    "autotune": "Автотюн", "pitch": "Зміна висоти тону", "denoise": "Шумоподавлення",
    "debleed": "Прибрати залишки інших інструментів", "deess": "Де-есер (приглушити «с», «ш»)",
    "normalize": "Нормалізація", "reverse": "Реверс", "gain": "Гучність", "gate": "Гейт (тиша між фразами)",
    "pitchedit": "Редактор висоти нот", "breath": "Прибрати вдихи й клацання", "rider": "Вокал-райдер (рівна гучність)",
    "align": "Вирівнювання за часом", "vst": "VST-плагін", "deshimmer": "Прибрати цифрові артефакти", "dereverb": "Прибрати реверберацію",
    "highs": "Відновити верхи", "drumreplace": "Заміна барабанів", "quantize": "Квантування аудіо",
    "stretch": "Розтягування в часі", "formant": "Тембр голосу", "tempomap": "Підгонка під доріжку темпу", "tempoclips": "Підгонка кліпів під доріжку темпу", "harmony": "Вокальна гармонія",
}


def _stft(x, n_fft=2048, hop=512):
    import librosa

    return librosa.stft(x, n_fft=n_fft, hop_length=hop)


def _istft(X, n, n_fft=2048, hop=512):
    import librosa

    return librosa.istft(X, hop_length=hop, n_fft=n_fft, length=n)


def _smooth2d(m, ft=3, tt=5):
    import scipy.ndimage

    return scipy.ndimage.uniform_filter(m, size=(ft, tt), mode="nearest")


def _per_channel(y, fn):
    return np.stack([fn(ch) for ch in np.atleast_2d(y)]).astype(np.float32)


def track_pitch(mono: np.ndarray, sr: int, fmin=65.0, fmax=1100.0, progress=None):
    import librosa

    y = librosa.resample(mono, orig_sr=sr, target_sr=22050) if sr != 22050 else mono
    hop = 256
    chunk = 22050 * 20
    f0s, vs = [], []
    n_chunks = max(1, int(np.ceil(len(y) / chunk)))
    for i in range(n_chunks):
        seg = y[i * chunk: (i + 1) * chunk + 2048]
        f0, v, _ = librosa.pyin(seg, fmin=fmin, fmax=fmax, sr=22050, frame_length=1024, hop_length=hop,
                                center=True, fill_na=0.0)
        keep = int(np.ceil(min(chunk, len(y) - i * chunk) / hop))
        f0s.append(np.nan_to_num(f0[:keep]))
        vs.append(v[:keep])
        if progress:
            progress((i + 1) / n_chunks)
    f0 = np.concatenate(f0s)
    v = np.concatenate(vs)
    f0[~v] = 0.0
    times = np.arange(len(f0)) * hop / 22050
    return times, f0


def psola(y: np.ndarray, sr: int, times: np.ndarray, f0: np.ndarray, ratio: np.ndarray) -> np.ndarray:
    y = np.atleast_2d(y).astype(np.float32)
    n = y.shape[1]
    mono = y.mean(axis=0)
    fr = np.clip(np.round(np.arange(n)[:: 64] / sr / (times[1] - times[0] if len(times) > 1 else 0.01)), 0,
                 len(times) - 1).astype(int)
    f0_s = np.repeat(f0[fr], 64)[:n]
    r_s = np.repeat(ratio[fr], 64)[:n]
    marks, periods, rats = [], [], []
    i = 0
    unv = int(0.008 * sr)
    while i < n:
        f = f0_s[i]
        if f > 0:
            P = int(sr / f)
            lo, hi = max(0, i - P // 4), min(n, i + P // 4 + 1)
            if hi > lo:
                i = lo + int(np.argmax(mono[lo:hi]))
            marks.append(i)
            periods.append(P)
            rats.append(float(r_s[i]))
            i += max(P, 16)
        else:
            marks.append(i)
            periods.append(unv)
            rats.append(1.0)
            i += unv
    marks = np.array(marks)
    periods = np.array(periods)
    rats = np.array(rats)
    out = np.zeros_like(y)
    wsum = np.zeros(n, np.float32)
    t = float(marks[0]) if len(marks) else 0.0
    k = 0
    while t < n and len(marks):
        while k + 1 < len(marks) and abs(marks[k + 1] - t) < abs(marks[k] - t):
            k += 1
        a, P, r = int(marks[k]), int(periods[k]), rats[k]
        w = np.hanning(2 * P + 1).astype(np.float32)
        s0, s1 = a - P, a + P + 1
        d0 = int(round(t)) - P
        cut0 = max(0, -s0, -d0)
        cut1 = max(0, s1 - n, d0 + 2 * P + 1 - n)
        if 2 * P + 1 - cut0 - cut1 > 0:
            seg = y[:, s0 + cut0: s1 - cut1] * w[cut0: 2 * P + 1 - cut1]
            out[:, d0 + cut0: d0 + 2 * P + 1 - cut1] += seg
            wsum[d0 + cut0: d0 + 2 * P + 1 - cut1] += w[cut0: 2 * P + 1 - cut1]
        t += max(8.0, P / max(r, 0.25))
    good = wsum > 0.15
    out[:, good] /= wsum[good]
    out[:, ~good] = y[:, ~good] * 0
    out[:, ~good] += y[:, ~good] * (wsum[~good] / 0.15)
    return out


def hz_to_midi(f):
    return 69 + 12 * np.log2(np.maximum(f, 1e-6) / 440.0)


def autotune(y, sr, tonic=0, scale="minor", strength=1.0, speed_ms=20.0, humanize=0.3, notes_only=None,
             progress=None):
    import scipy.ndimage
    import scipy.signal

    mono = np.atleast_2d(y).mean(axis=0)
    times, f0 = track_pitch(mono, sr, progress=(lambda p: progress(p * 0.7)) if progress else None)
    voiced = f0 > 0
    midi = hz_to_midi(f0)
    sm = midi.copy()
    if voiced.any():
        sm[voiced] = scipy.signal.medfilt(midi[voiced], 9) if voiced.sum() > 9 else midi[voiced]
        k = max(3, int(0.12 / (times[1] - times[0])) | 1)
        slow = midi.copy()
        slow[voiced] = scipy.ndimage.uniform_filter1d(sm[voiced], k) if voiced.sum() > k else sm[voiced]
    else:
        slow = sm
    pcs = sorted({(tonic + i) % 12 for i in SCALES.get(scale, SCALES["major"])})
    allowed = np.array([p + 12 * o for o in range(-1, 11) for p in pcs], dtype=float)
    target = np.zeros_like(midi)
    cur = None
    for i in range(len(midi)):
        if not voiced[i]:
            cur = None
            continue
        p = sm[i]
        if cur is None or abs(p - cur) > 0.62:
            cur = float(allowed[np.argmin(np.abs(allowed - p))])
        target[i] = cur
    corr_raw = np.where(voiced, target - midi, 0.0)
    corr_slow = np.where(voiced, target - slow, 0.0)
    corr = (1 - humanize) * corr_raw + humanize * corr_slow
    if speed_ms > 0:
        dt = times[1] - times[0]
        a = np.exp(-dt / (speed_ms / 1000.0))
        out = np.zeros_like(corr)
        prev = 0.0
        for i in range(len(corr)):
            if not voiced[i]:
                prev = 0.0
                continue
            prev = a * prev + (1 - a) * corr[i]
            out[i] = prev
        corr = out
    corr *= strength
    ratio = np.where(voiced, 2 ** (corr / 12.0), 1.0)
    if progress:
        progress(0.75)
    res = psola(y, sr, times, f0, ratio)
    if progress:
        progress(1.0)
    stats = {"voiced_pct": round(float(voiced.mean() * 100), 1),
             "avg_correction_cents": round(float(np.mean(np.abs(corr[voiced])) * 100) if voiced.any() else 0.0, 1)}
    return res, stats


def pitch_shift(y, sr, semitones=0.0, mode="voice", progress=None):
    if abs(semitones) < 1e-3:
        return np.atleast_2d(y).copy(), {}
    if mode == "voice":
        mono = np.atleast_2d(y).mean(axis=0)
        times, f0 = track_pitch(mono, sr, progress=(lambda p: progress(p * 0.7)) if progress else None)
        ratio = np.where(f0 > 0, 2 ** (semitones / 12.0), 1.0)
        return psola(y, sr, times, f0, ratio), {}
    import librosa

    return _per_channel(y, lambda c: librosa.effects.pitch_shift(c, sr=sr, n_steps=semitones)), {}


def denoise(y, sr, amount_db=14.0, sensitivity=1.5, region=None, progress=None, profile_y=None):
    y = np.atleast_2d(y).astype(np.float32)
    n = y.shape[1]
    hop = 512
    mono = np.atleast_2d(profile_y if profile_y is not None else y).mean(axis=0)
    M = np.abs(_stft(mono))
    Mdb = 20 * np.log10(M + 1e-10)
    if region and region[1] > region[0]:
        a, b = int(region[0] * sr / hop), int(region[1] * sr / hop)
        prof = Mdb[:, max(0, a): max(a + 2, b)]
    else:
        e = Mdb.mean(axis=0)
        valid = e > -95
        if valid.sum() < 10:
            valid = np.ones_like(e, bool)
        thr = np.percentile(e[valid], 10)
        prof = Mdb[:, valid & (e <= thr)]
    mu, sd = prof.mean(axis=1, keepdims=True), prof.std(axis=1, keepdims=True) + 1.0
    floor = 10 ** (-amount_db / 20)

    def proc(ch):
        X = _stft(ch)
        Xdb = 20 * np.log10(np.abs(X) + 1e-10)
        mask = 1 / (1 + np.exp(np.clip(-(Xdb - (mu + sensitivity * sd)) / 2.5, -60, 60)))
        mask = _smooth2d(mask, 3, 5)
        g = floor + (1 - floor) * mask
        return _istft(X * g, n)

    out = _per_channel(y, proc)
    if progress:
        progress(1)
    return out, {"profile": "виділений фрагмент" if region else "автоматично (найтихіші місця)"}


def debleed(y, sr, others: list[np.ndarray], strength=1.0, reduction_db=18.0, progress=None):
    y = np.atleast_2d(y).astype(np.float32)
    n = y.shape[1]
    Po = None
    for o in others:
        om = np.atleast_2d(o).mean(axis=0)[:n]
        if len(om) < n:
            om = np.pad(om, (0, n - len(om)))
        P = np.abs(_stft(om)) ** 2
        Po = P if Po is None else Po + P
    if Po is None:
        return y.copy(), {"note": "немає інших доріжок для порівняння"}
    Po = _smooth2d(Po, 3, 3)
    floor = 10 ** (-reduction_db / 20)

    def proc(ch):
        X = _stft(ch)
        Pa = _smooth2d(np.abs(X) ** 2, 3, 3)
        m = Pa / (Pa + strength * Po + 1e-12)
        m = _smooth2d(m, 3, 5) ** 0.7
        return _istft(X * (floor + (1 - floor) * m), n)

    out = _per_channel(y, proc)
    if progress:
        progress(1)
    return out, {}


def deess(y, sr, amount_db=8.0, freq=5000.0, sensitivity=0.5, progress=None):
    y = np.atleast_2d(y).astype(np.float32)
    n = y.shape[1]
    import librosa

    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    hi = freqs >= freq
    M = np.abs(_stft(y.mean(axis=0))) ** 2
    ratio_db = 10 * np.log10(M[hi].sum(axis=0) / (M.sum(axis=0) + 1e-12) + 1e-12)
    thr = np.percentile(ratio_db, 85 - 25 * sensitivity)
    over = np.clip(ratio_db - thr, 0, None)
    att_db = np.clip(over * 1.5, 0, amount_db)
    import scipy.ndimage

    att_db = scipy.ndimage.maximum_filter1d(att_db, 3)
    att_db = scipy.ndimage.uniform_filter1d(att_db, 3)
    g = 10 ** (-att_db / 20)

    def proc(ch):
        X = _stft(ch)
        X[hi] *= g[None, : X.shape[1]]
        return _istft(X, n)

    out = _per_channel(y, proc)
    if progress:
        progress(1)
    return out, {"frames_reduced_pct": round(float((att_db > 1).mean() * 100), 1)}


def gate(y, sr, threshold_db=-45.0, release_ms=120.0, range_db=40.0, progress=None):
    import librosa

    y = np.atleast_2d(y).astype(np.float32)
    hop = 256
    rms = librosa.feature.rms(y=y.mean(axis=0), hop_length=hop, frame_length=1024)[0]
    ref = np.percentile(rms, 99) + 1e-9
    db = 20 * np.log10(rms / ref + 1e-9)
    open_ = db > threshold_db
    rel = max(1, int(release_ms / 1000 * sr / hop))
    import scipy.ndimage

    open_ = scipy.ndimage.maximum_filter1d(open_.astype(float), rel)
    floor = 10 ** (-range_db / 20)
    g = floor + (1 - floor) * scipy.ndimage.uniform_filter1d(open_, 5)
    gs = np.interp(np.arange(y.shape[1]), np.arange(len(g)) * hop, g).astype(np.float32)
    if progress:
        progress(1)
    return y * gs, {"open_pct": round(float(open_.mean() * 100), 1)}


def normalize(y, sr, peak_db=-1.0, progress=None):
    y = np.atleast_2d(y).astype(np.float32)
    p = float(np.abs(y).max())
    if p <= 0:
        return y.copy(), {}
    g = 10 ** (peak_db / 20) / p
    return y * g, {"gain_db": round(20 * np.log10(g), 2)}


def gain(y, sr, db=0.0, progress=None):
    return np.atleast_2d(y).astype(np.float32) * (10 ** (db / 20)), {}


def reverse(y, sr, progress=None):
    return np.atleast_2d(y)[:, ::-1].copy(), {}


class Versions:
    def __init__(self, pdir: Path):
        self.pdir = pdir
        self.dir = pdir / "versions"
        self.dir.mkdir(exist_ok=True)
        self.meta_f = self.dir / "versions.json"
        from .jsonio import read_json

        self.meta = read_json(self.meta_f, {}) or {}

    def save_meta(self):
        from .jsonio import write_json

        write_json(self.meta_f, self.meta)

    def path(self, vid_or_track: str) -> Path:
        if vid_or_track in self.meta:
            return self.dir / f"{vid_or_track}.wav"
        return self.pdir / "stems" / f"{vid_or_track}.wav"

    def add(self, base: str, parent: str | None, op: str, params: dict, y, sr, stats) -> dict:
        from .project import save_wav, to_mono_sr

        vid = "v" + uuid.uuid4().hex[:8]
        save_wav(self.dir / f"{vid}.wav", y, sr)
        save_wav(self.dir / f"{vid}_preview.wav", to_mono_sr(y, sr)[None], 22050, "PCM_16")
        chain = (self.meta.get(parent, {}).get("chain", []) if parent else []) + [OPS.get(op, op)]
        self.meta[vid] = {"vid": vid, "base": base, "parent": parent, "op": op, "label": OPS.get(op, op),
                          "params": params, "stats": stats, "chain": chain, "created": time.strftime("%H:%M:%S")}
        self.save_meta()
        return self.meta[vid]

    def for_base(self, base: str) -> list[dict]:
        return [v for v in self.meta.values() if v["base"] == base]

    def delete(self, vid: str):
        if vid in self.meta:
            for f in (self.dir / f"{vid}.wav", self.dir / f"{vid}_preview.wav"):
                f.unlink(missing_ok=True)
            del self.meta[vid]
            self.save_meta()


def apply_op(pdir: Path, project: dict, base: str, source: str | None, op: str, params: dict, progress=None,
             window: tuple[float, float] | None = None):
    from .project import load_audio

    V = Versions(pdir)
    src_path = V.path(source) if source else pdir / "stems" / f"{base}.wav"
    full, sr = load_audio(src_path)
    n = full.shape[1]
    if window:
        margin = int(0.6 * sr)
        s0 = int(max(0.0, window[0]) * sr)
        s1 = int(min(n, max(s0 + sr // 4, int(window[1] * sr))))
        a, b = max(0, s0 - margin), min(n, s1 + margin)
        y = full[:, a:b]
    else:
        a, b, s0, s1 = 0, n, 0, n
        y = full
    key = project["analysis"]["key"]
    ko = project.get("settings", {}).get("key_override")
    if ko and "tonic" in ko:
        key = {"tonic": ko["tonic"], "mode": ko.get("mode", "major")}
    p = dict(params or {})
    stats = {}
    if op == "none":
        res = y
    elif op == "autotune":
        scale = p.get("scale") or key["mode"]
        tonic = int(p.get("tonic", key["tonic"]))
        res, stats = autotune(y, sr, tonic, scale, float(p.get("strength", 1.0)), float(p.get("speed_ms", 20)),
                              float(p.get("humanize", 0.3)), progress=progress)
        p.update(scale=scale, tonic=tonic)
    elif op == "pitch":
        res, stats = pitch_shift(y, sr, float(p.get("semitones", 0)), p.get("mode", "voice"), progress)
    elif op == "denoise":
        reg = p.get("region")
        if reg and window:
            prof = full[:, int(reg[0] * sr): max(int(reg[0] * sr) + 2048, int(reg[1] * sr))]
            res, stats = denoise(y, sr, float(p.get("amount_db", 14)), float(p.get("sensitivity", 1.5)), None, progress,
                                 profile_y=prof)
        else:
            res, stats = denoise(y, sr, float(p.get("amount_db", 14)), float(p.get("sensitivity", 1.5)),
                                 tuple(reg) if reg else None, progress, profile_y=full if window else None)
    elif op == "debleed":
        others = []
        for t in project["tracks"]:
            if t["id"] != base:
                o, _ = load_audio(pdir / "stems" / f"{t['id']}.wav")
                others.append(o[:, a:b])
        res, stats = debleed(y, sr, others, float(p.get("strength", 1.0)), float(p.get("reduction_db", 18)), progress)
    elif op == "deess":
        res, stats = deess(y, sr, float(p.get("amount_db", 8)), float(p.get("freq", 5000)),
                           float(p.get("sensitivity", 0.5)), progress)
    elif op == "gate":
        res, stats = gate(y, sr, float(p.get("threshold_db", -45)), float(p.get("release_ms", 120)),
                          float(p.get("range_db", 40)), progress)
    elif op == "normalize":
        peak = float(np.abs(full).max()) or 1.0
        g = 10 ** (float(p.get("peak_db", -1)) / 20) / peak
        res, stats = y * g, {"gain_db": round(20 * np.log10(g), 2)}
    elif op == "gain":
        res, stats = gain(y, sr, float(p.get("db", 0)))
    elif op == "pitchedit":
        from .vocal import pitch_edit

        res, stats = pitch_edit(pdir, src_path, full, sr, list(p.get("edits", [])), progress)
        if window:
            res = res[:, a:b]
    elif op == "breath":
        from .vocal import breath_click

        res, stats = breath_click(y, sr, float(p.get("breath_db", 14)), bool(p.get("clicks", True)),
                                  float(p.get("sensitivity", 0.5)), progress)
    elif op == "rider":
        from .vocal import rider

        tdb = p.get("target_db")
        res, stats = rider(y, sr, float(p.get("amount", 0.7)), float(p.get("range_db", 6)),
                           None if tdb in (None, "", "auto") else float(tdb), progress)
    elif op == "align":
        from .vocal import align

        gid = p.get("guide")
        if not gid:
            raise ValueError("Виберіть доріжку-орієнтир для вирівнювання.")
        gpath = V.path(gid)
        g, gsr = load_audio(gpath, sr)
        g = g[:, a:b] if g.shape[1] >= b else np.pad(g, ((0, 0), (0, max(0, b - g.shape[1]))))[:, a:b]
        res, stats = align(y, sr, g, float(p.get("strength", 1.0)), float(p.get("max_ms", 150)) / 1000, progress)
    elif op in ("deshimmer", "dereverb", "highs", "drumreplace", "quantize"):
        from . import fix as FX

        if op == "deshimmer":
            res, stats = FX.deshimmer(y, sr, float(p.get("amount", 0.6)), float(p.get("freq", 6000)), progress)
        elif op == "dereverb":
            res, stats = FX.dereverb(y, sr, float(p.get("amount", 0.6)), float(p.get("rt", 0.6)), float(p.get("floor_db", -14)), progress)
        elif op == "highs":
            res, stats = FX.restore_highs(y, sr, float(p.get("amount", 0.5)), float(p.get("cutoff", 0) or 0), progress)
        elif op == "drumreplace":
            res, stats = FX.drum_replace(y, sr, p.get("kick", "synth:kick"), p.get("snare", "synth:snare"), p.get("hat", "off"),
                                         float(p.get("level_db", 0)), p.get("mode", "layer"), bool(p.get("follow", True)),
                                         float(p.get("sensitivity", 0.5)), pdir, progress)
        else:
            step = float(p.get("grid_beats", 0.25)) * float(p.get("period", 0.5))
            off = (-float(p.get("pad", 0)) - (a / sr if window else 0)) % step
            res, stats = FX.quantize_audio(y, sr, step, off, float(p.get("strength", 0.8)), None, progress)
    elif op == "vst":
        from .vst import process_array

        if not p.get("path") and p.get("plugin"):
            p["path"], _, nm = str(p["plugin"]).partition("::")
            p["name"] = nm or None
        if not p.get("path"):
            raise ValueError("Виберіть VST-плагін.")
        res = process_array(y, sr, p["path"], p.get("name"), p.get("state"))
        mix = float(p.get("mix", 1.0))
        if mix < 0.999:
            res = res[:, : y.shape[1]] * mix + y * (1 - mix)
        stats = {"plugin": p.get("label") or p.get("name") or Path(p["path"]).stem}
    elif op == "reverse":
        res = full[:, ::-1][:, a:b].copy() if window else full[:, ::-1].copy()
    elif op == "stretch":
        from .creative import stretch

        res, stats = stretch(y, sr, p.get("mode", "fit"), float(p.get("from_bpm", 0) or 0), float(p.get("to_bpm", 120) or 120),
                             float(p.get("speed", 100)), str(p.get("keep_pitch", "1")) not in ("0", "false", "False"), progress)
        if window:
            res = np.pad(res, ((0, 0), (0, max(0, (s1 - a) - res.shape[1]))))
    elif op == "harmony":
        from .creative import harmonize_voice

        res, stats = harmonize_voice(y, sr, p.get("notes") or [], bool(p.get("keep_gaps")), progress, p.get("auto"))
    elif op == "tempomap":
        from .creative import tempo_warp

        res, stats = tempo_warp(y, sr, p.get("segs") or [], progress)
    elif op == "tempoclips":
        from .creative import tempo_clips

        res, stats = tempo_clips(y, sr, p.get("pieces") or [], progress)
    elif op == "formant":
        from .creative import formant

        res, stats = formant(y, sr, float(p.get("shift", 0)), p.get("character", "none"), float(p.get("mix", 1.0)), progress)
    else:
        raise ValueError(f"невідома операція {op}")
    res = np.atleast_2d(res)
    if window:
        res = res[:, s0 - a: s0 - a + (s1 - s0)]
    return res.astype(np.float32), sr, stats, p


def run_op(pdir: Path, project: dict, base: str, source: str | None, op: str, params: dict, progress=None) -> dict:
    res, sr, stats, p = apply_op(pdir, project, base, source, op, params, progress)
    return Versions(pdir).add(base, source, op, p, res, sr, stats)


def preview_wav(pdir: Path, project: dict, base: str, source: str | None, op: str, params: dict,
                start: float, dur: float) -> bytes:
    import io

    import soundfile as sf

    dur = float(min(max(dur, 1.0), 20.0))
    res, sr, _, _ = apply_op(pdir, project, base, source, op, params, window=(start, start + dur))
    peak = float(np.abs(res).max()) if res.size else 0.0
    if peak > 0.999:
        res = res * (0.999 / peak)
    buf = io.BytesIO()
    sf.write(buf, res.T, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()
