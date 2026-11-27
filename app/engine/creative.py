from __future__ import annotations

import numpy as np


def estimate_bpm(y: np.ndarray, sr: int) -> float:
    import librosa

    mono = np.atleast_2d(y).mean(axis=0)
    if sr > 22050:
        mono = librosa.resample(mono, orig_sr=sr, target_sr=22050)
        sr = 22050
    tempo, _ = librosa.beat.beat_track(y=mono, sr=sr, units="time")
    bpm = float(np.atleast_1d(tempo)[0]) if np.size(tempo) else 120.0
    while bpm < 70:
        bpm *= 2
    while bpm > 180:
        bpm /= 2
    return round(bpm, 2)


def _stretch_hq(y: np.ndarray, sr: int, factor: float, semis: float = 0.0) -> np.ndarray:
    try:
        from pedalboard import time_stretch

        out = time_stretch(np.ascontiguousarray(y, dtype=np.float32), sr, stretch_factor=1.0 / factor,
                           pitch_shift_in_semitones=semis, high_quality=True)
        return np.atleast_2d(out).astype(np.float32)
    except Exception:
        import librosa

        rows = []
        for ch in np.atleast_2d(y):
            z = librosa.effects.time_stretch(ch, rate=1.0 / factor)
            if semis:
                z = librosa.effects.pitch_shift(z, sr=sr, n_steps=semis)
            rows.append(z)
        n = min(len(r) for r in rows)
        return np.stack([r[:n] for r in rows]).astype(np.float32)


def stretch(y: np.ndarray, sr: int, mode: str = "fit", from_bpm: float = 0.0, to_bpm: float = 120.0,
            speed: float = 100.0, keep_pitch: bool = True, progress=None):
    y = np.atleast_2d(y)
    detected = None
    if mode == "fit":
        src = float(from_bpm or 0)
        if src <= 0:
            detected = estimate_bpm(y, sr)
            src = detected
        dst = float(to_bpm or src)
        candidates = [src, src * 2, src / 2]
        src = min(candidates, key=lambda b: abs(np.log(dst / b)))
        factor = src / dst
    elif mode == "bpm":
        factor = float(from_bpm or to_bpm or 120) / max(20.0, float(to_bpm or 120))
    else:
        factor = 100.0 / max(10.0, float(speed))
    factor = float(np.clip(factor, 0.25, 4.0))
    if progress:
        progress(0.1)
    if abs(factor - 1.0) < 1e-4:
        res = y.copy()
    elif keep_pitch:
        res = _stretch_hq(y, sr, factor)
    else:
        from scipy.signal import resample

        n = int(round(y.shape[1] * factor))
        res = np.stack([resample(ch, n) for ch in y]).astype(np.float32)
    if progress:
        progress(1.0)
    stats = {"factor": round(factor, 6), "speed_pct": round(100.0 / factor, 2)}
    if detected:
        stats["detected_bpm"] = detected
    return res, stats


def formant(y: np.ndarray, sr: int, shift: float = 0.0, character: str = "none", mix: float = 1.0, progress=None):
    y = np.atleast_2d(y).astype(np.float32)
    shift = float(np.clip(shift, -12, 12))
    if progress:
        progress(0.1)
    res = y
    if abs(shift) > 0.01:
        from scipy.signal import resample

        r = 2 ** (shift / 12.0)
        n = y.shape[1]
        m = max(16, int(round(n / r)))
        moved = np.stack([resample(ch, m) for ch in y]).astype(np.float32)
        back = _stretch_hq(moved, sr, n / m, -shift)
        if back.shape[1] < n:
            back = np.pad(back, ((0, 0), (0, n - back.shape[1])))
        res = back[:, :n]
    if progress:
        progress(0.6)
    if character == "phone":
        from scipy.signal import butter, sosfilt

        sos = butter(4, [400, 3200], btype="band", fs=sr, output="sos")
        res = np.tanh(sosfilt(sos, res, axis=1) * 2.2) * 0.6
    elif character == "radio":
        from scipy.signal import butter, sosfilt

        sos = butter(3, [250, 5000], btype="band", fs=sr, output="sos")
        res = np.tanh(sosfilt(sos, res, axis=1) * 1.6) * 0.75
    elif character == "double":
        d1, d2 = int(0.017 * sr), int(0.029 * sr)
        a = np.pad(res, ((0, 0), (d1, 0)))[:, : res.shape[1]]
        b = np.pad(res, ((0, 0), (d2, 0)))[:, : res.shape[1]]
        if res.shape[0] == 1:
            res = np.vstack([res * 0.8 + a * 0.5, res * 0.8 + b * 0.5])
        else:
            res = np.vstack([res[0] * 0.8 + a[0] * 0.5, res[1] * 0.8 + b[1] * 0.5])
    elif character == "robot":
        t = np.arange(res.shape[1]) / sr
        res = res * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 50 * t)))
    mix = float(np.clip(mix, 0, 1))
    if mix < 0.999:
        base = y if y.shape[0] == res.shape[0] else np.vstack([y[0], y[0]])
        res = res * mix + base[:, : res.shape[1]] * (1 - mix)
    if progress:
        progress(1.0)
    return res.astype(np.float32), {"shift": shift, "character": character}


def hum_notes(y: np.ndarray, sr: int, progress=None, min_len: float = 0.09):
    from .processing import track_pitch

    mono = np.atleast_2d(y).mean(axis=0)
    times, f0 = track_pitch(mono, sr, fmin=70.0, fmax=1000.0, progress=progress)
    if not len(f0):
        return []
    midi = np.zeros_like(f0)
    v = f0 > 0
    midi[v] = 69 + 12 * np.log2(f0[v] / 440.0)
    from scipy.ndimage import median_filter

    sm = median_filter(np.where(v, midi, 0), size=7)
    q = np.where(sm > 0, np.round(sm), 0).astype(int)
    hop = times[1] - times[0] if len(times) > 1 else 0.0116
    rms_env = None
    try:
        import librosa

        rms_env = librosa.feature.rms(y=mono, frame_length=2048, hop_length=max(1, int(hop * sr)))[0]
    except Exception:
        pass
    notes = []
    i = 0
    n = len(q)
    while i < n:
        if q[i] <= 0:
            i += 1
            continue
        j = i
        while j + 1 < n and abs(q[j + 1] - q[i]) == 0:
            j += 1
        t0, t1 = float(times[i]), float(times[j]) + hop
        if t1 - t0 >= min_len:
            vel = 90
            if rms_env is not None and len(rms_env):
                a = int(min(len(rms_env) - 1, i))
                b = int(min(len(rms_env), j + 1))
                lvl = float(np.mean(rms_env[a:b])) if b > a else float(rms_env[a])
                vel = int(np.clip(50 + 400 * lvl, 40, 120))
            notes.append([float(t0), float(t1 - t0), int(q[i]), int(vel)])
        i = j + 1
    merged = []
    for nt in notes:
        if merged and merged[-1][2] == nt[2] and nt[0] - (merged[-1][0] + merged[-1][1]) < 0.04:
            merged[-1][1] = nt[0] + nt[1] - merged[-1][0]
        else:
            merged.append(list(nt))
    return merged


def beatbox_notes(y: np.ndarray, sr: int, sensitivity: float = 0.5, progress=None):
    import librosa

    mono = np.atleast_2d(y).mean(axis=0)
    if sr != 22050:
        mono = librosa.resample(mono, orig_sr=sr, target_sr=22050)
        sr = 22050
    if progress:
        progress(0.2)
    env = librosa.onset.onset_strength(y=mono, sr=sr, hop_length=256)
    delta = float(np.interp(sensitivity, [0, 1], [0.25, 0.03]))
    on = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=256, backtrack=True, delta=delta, units="samples")
    if progress:
        progress(0.5)
    out = []
    win = int(0.07 * sr)
    peak_env = float(env.max()) or 1.0
    for s in on:
        seg = mono[s: s + win]
        if len(seg) < 64:
            continue
        spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg))))
        freqs = np.fft.rfftfreq(len(seg), 1 / sr)
        tot = float(spec.sum()) or 1e-9
        low = float(spec[freqs < 180].sum()) / tot
        high = float(spec[freqs > 4500].sum()) / tot
        cen = float((spec * freqs).sum() / tot)
        if low > 0.35 or (cen < 700 and high < 0.08):
            pitch = 36
        elif high > 0.3 or cen > 4200:
            pitch = 46 if len(seg) >= win and float(np.abs(seg[win // 2:]).mean()) > 0.5 * float(np.abs(seg[: win // 2]).mean()) else 42
        else:
            pitch = 38
        fr = min(len(env) - 1, s // 256)
        vel = int(np.clip(55 + 70 * env[fr] / peak_env, 40, 127))
        out.append([float(s / sr), 0.12, int(pitch), int(vel)])
    if progress:
        progress(1.0)
    return out


def slice_audio(y: np.ndarray, sr: int, out_dir, rel_base: str, sensitivity: float = 0.5, max_slices: int = 32, progress=None):
    import librosa
    import soundfile as sf
    from pathlib import Path

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    y = np.atleast_2d(y)
    mono = y.mean(axis=0)
    hop = 256
    env = librosa.onset.onset_strength(y=mono, sr=sr, hop_length=hop)
    delta = float(np.interp(sensitivity, [0, 1], [0.3, 0.03]))
    on = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=hop, backtrack=True, delta=delta, units="samples")
    on = [int(s) for s in on]
    if not on or on[0] > int(0.03 * sr):
        on = [0] + on
    min_gap = int(0.06 * sr)
    clean = []
    for s in on:
        if not clean or s - clean[-1] >= min_gap:
            clean.append(s)
    if len(clean) > max_slices:
        strength = [env[min(len(env) - 1, s // hop)] for s in clean]
        keep = sorted(np.argsort(strength)[::-1][:max_slices])
        clean = [clean[i] for i in keep]
        if clean[0] != 0:
            clean[0] = 0
    bounds = clean + [y.shape[1]]
    slices = []
    fade = int(0.004 * sr)
    for i in range(len(clean)):
        a, b = bounds[i], bounds[i + 1]
        if b - a < int(0.02 * sr):
            continue
        seg = y[:, a:b].copy()
        f = min(fade, seg.shape[1] // 4)
        if f > 0:
            seg[:, -f:] *= np.linspace(1, 0, f, dtype=np.float32)
            seg[:, :f] *= np.linspace(0, 1, f, dtype=np.float32)
        fn = out_dir / f"s{i:02d}.wav"
        sf.write(str(fn), seg.T, sr, subtype="PCM_16")
        slices.append({"file": f"{rel_base}/{fn.name}", "start": a / sr, "dur": (b - a) / sr})
        if progress:
            progress((i + 1) / len(clean))
    return slices


def tempo_warp(y: np.ndarray, sr: int, segs: list, progress=None):
    y = np.atleast_2d(y)
    n = y.shape[1]
    cuts = []
    for i, (a, b, r) in enumerate(segs):
        s0 = 0 if i == 0 else int(max(0, min(n, round(float(a) * sr))))
        s1 = n if i == len(segs) - 1 else int(max(0, min(n, round(float(b) * sr))))
        if s1 > s0:
            cuts.append((s0, s1, float(r)))
    out, fade, tail = [], int(0.008 * sr), None
    for k, (s0, s1, r) in enumerate(cuts):
        piece = y[:, max(0, s0 - fade):min(n, s1 + 4 * fade)]
        z = piece if abs(r - 1) < 1e-4 else _stretch_hq(piece, sr, 1.0 / r)
        lead = int(round((s0 - max(0, s0 - fade)) / r))
        want = int(round((s1 - s0) / r))
        full = z[:, lead:]
        z = full[:, :want].copy()
        if z.shape[1] < want:
            z = np.pad(z, ((0, 0), (0, want - z.shape[1])))
        if tail is not None and fade and z.shape[1] > fade and tail.shape[1] >= fade:
            w = np.linspace(0, 1, fade, dtype=np.float32)
            z[:, :fade] = z[:, :fade] * w + tail[:, :fade] * (1 - w)
        tail = full[:, want:want + fade]
        out.append(z.astype(np.float32))
        if progress:
            progress((k + 1) / len(cuts))
    res = np.concatenate(out, axis=1) if out else y
    return res, {"segments": len(cuts), "length_s": round(res.shape[1] / sr, 2)}


def harmonize_voice(y: np.ndarray, sr: int, notes: list, keep_gaps: bool = False, progress=None):
    y = np.atleast_2d(y)
    n = y.shape[1]
    out = np.zeros_like(y) if not keep_gaps else y.copy()
    fade = int(0.012 * sr)
    segs = sorted((float(a), float(b), float(s)) for a, b, s in notes if float(b) > float(a))
    merged = []
    for a, b, st in segs:
        if merged and abs(merged[-1][2] - st) < 1e-3 and a - merged[-1][1] < 0.06:
            merged[-1][1] = b
        else:
            merged.append([a, b, st])
    for k, (a, b, st) in enumerate(merged):
        s0, s1 = max(0, int(a * sr) - fade), min(n, int(b * sr) + fade)
        if s1 - s0 < fade * 3:
            continue
        piece = y[:, s0:s1]
        z = _stretch_hq(piece, sr, 1.0, st) if abs(st) > 1e-3 else piece.copy()
        z = z[:, : s1 - s0]
        if z.shape[1] < s1 - s0:
            z = np.pad(z, ((0, 0), (0, s1 - s0 - z.shape[1])))
        env = np.ones(s1 - s0, dtype=np.float32)
        env[:fade] = np.linspace(0, 1, fade)
        env[-fade:] = np.linspace(1, 0, fade)
        out[:, s0:s1] = out[:, s0:s1] * (1 - env) + z * env
        if progress:
            progress((k + 1) / max(1, len(merged)))
    return out.astype(np.float32), {"segments": len(merged)}


def estimate_key(y: np.ndarray, sr: int):
    import librosa

    mono = np.atleast_2d(y).mean(axis=0)[: sr * 30]
    if len(mono) < sr // 2:
        return None
    ch = librosa.feature.chroma_cqt(y=mono, sr=sr).mean(axis=1)
    if ch.sum() <= 0:
        return None
    maj = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    mnr = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
    best = (-9, 0, "major")
    for t in range(12):
        for prof, mode in ((maj, "major"), (mnr, "minor")):
            c = float(np.corrcoef(np.roll(prof, t), ch)[0, 1])
            if c > best[0]:
                best = (c, t, mode)
    return {"tonic": best[1], "mode": best[2], "conf": round(best[0], 3)}
