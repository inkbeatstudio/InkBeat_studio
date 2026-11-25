from __future__ import annotations

from pathlib import Path

import numpy as np


def _stft(x, n=2048, h=512):
    import librosa

    return librosa.stft(x, n_fft=n, hop_length=h)


def _istft(X, length, h=512):
    import librosa

    return librosa.istft(X, hop_length=h, length=length)


def deshimmer(y, sr, amount=0.6, freq=6000.0, progress=None):
    import scipy.ndimage

    y = np.atleast_2d(y).astype(np.float32)
    out = np.zeros_like(y)
    n = 2048
    fr = np.fft.rfftfreq(n, 1 / sr)
    w = np.clip(np.log2(np.maximum(fr, 1) / (freq / 2)), 0, 1)[:, None] * amount
    red = []
    for c in range(y.shape[0]):
        X = _stft(y[c], n)
        M = np.abs(X)
        Ms = scipy.ndimage.median_filter(M, size=(5, 7), mode="nearest")
        k = 2.4 - 0.9 * amount
        over = M / np.maximum(Ms * k, 1e-9)
        G = np.where(over > 1, (1 / np.maximum(over, 1e-9)) ** (w * 1.6 / max(amount, 1e-3)), 1.0)
        G = np.minimum(1.0, G)
        out[c] = _istft(X * G, y.shape[1])
        red.append(float(np.mean(20 * np.log10(np.maximum(G[fr >= freq], 1e-6)))))
        if progress:
            progress((c + 1) / y.shape[0])
    return out, {"avg_high_reduction_db": round(float(np.mean(red)), 2)}


def dereverb(y, sr, amount=0.6, rt=0.6, floor_db=-14.0, progress=None):
    import scipy.ndimage

    y = np.atleast_2d(y).astype(np.float32)
    h = 256
    X = [_stft(ch, 1024, h) for ch in y]
    P = np.mean([np.abs(x) ** 2 for x in X], axis=0)
    P = scipy.ndimage.uniform_filter1d(P, 3, axis=1)
    D = max(1, int(0.05 * sr / h))
    a = np.exp(-2 * 6.908 * (D * h / sr) / max(0.1, rt))
    R = np.zeros_like(P)
    R[:, D:] = a * P[:, :-D]
    G = 1 - amount * R / np.maximum(P, 1e-12)
    G = np.clip(G, 10 ** (floor_db / 20), 1.0)
    G = scipy.ndimage.uniform_filter1d(G, 3, axis=0)
    out = np.stack([_istft(x * G, y.shape[1], h) for x in X])
    fr = lambda a: np.sqrt(np.mean(a.mean(axis=0)[: len(a[0]) // 1024 * 1024].reshape(-1, 1024) ** 2, axis=1))
    ri, ro = fr(y), fr(out)
    top = ri > np.percentile(ri, 70)
    if top.any() and ro[top].mean() > 1e-9:
        out *= min(2.0, ri[top].mean() / ro[top].mean())
    if progress:
        progress(1.0)
    return out.astype(np.float32), {"avg_reduction_db": round(float(np.mean(20 * np.log10(G))), 2)}


def detect_cutoff(y, sr):
    mono = np.atleast_2d(y).mean(axis=0)
    n = 4096
    seg = mono[: sr * 60]
    if len(seg) < n:
        return sr / 2
    frames = np.lib.stride_tricks.sliding_window_view(seg, n)[:: n * 2]
    spec = np.mean(np.abs(np.fft.rfft(frames * np.hanning(n), axis=1)) ** 2, axis=0)
    fr = np.fft.rfftfreq(n, 1 / sr)
    db = 10 * np.log10(spec + 1e-20)
    ref = np.median(db[(fr > 2000) & (fr < 6000)])
    idx = np.nonzero((db > ref - 35) & (fr > 4000))[0]
    return float(fr[idx[-1]]) if len(idx) else sr / 2


def restore_highs(y, sr, amount=0.5, cutoff=0.0, progress=None):
    import scipy.signal

    y = np.atleast_2d(y).astype(np.float32)
    fc = float(cutoff) if cutoff and cutoff > 1000 else detect_cutoff(y, sr)
    fc = min(fc, sr / 2 * 0.9)
    target = min(sr / 2 * 0.95, 19000)
    if fc > target - 500:
        fc = 9000.0
    bp = scipy.signal.butter(4, [fc / 2, fc * 0.98], "band", fs=sr, output="sos")
    hp = scipy.signal.butter(6, fc, "high", fs=sr, output="sos")
    out = np.zeros_like(y)
    for c in range(y.shape[0]):
        band = scipy.signal.sosfiltfilt(bp, y[c])
        e = np.sqrt(np.mean(band ** 2)) + 1e-9
        gen = np.tanh(band / e * 1.5) * e
        gen = np.abs(gen) * np.sign(band) * 0.5 + gen * 0.5
        gen = scipy.signal.sosfiltfilt(hp, gen)
        ge = np.sqrt(np.mean(gen ** 2)) + 1e-9
        gen *= (e / ge) * 10 ** (-12 / 20) * amount * 1.6
        out[c] = y[c] + gen
    if progress:
        progress(1.0)
    return out, {"cutoff_hz": int(fc)}


def synth_drum(kind: str, sr: int) -> np.ndarray:
    rng = np.random.default_rng(7)
    t = np.arange(int(sr * 0.6)) / sr
    if kind in ("kick", "punch"):
        f = 45 + 110 * np.exp(-t * (38 if kind == "kick" else 55))
        ph = 2 * np.pi * np.cumsum(f) / sr
        s = np.sin(ph) * np.exp(-t * (7 if kind == "kick" else 10))
        s[: int(sr * 0.004)] += rng.standard_normal(int(sr * 0.004)) * np.linspace(0.6, 0, int(sr * 0.004))
    elif kind == "808":
        t = np.arange(int(sr * 1.2)) / sr
        f = 48 + 60 * np.exp(-t * 30)
        s = np.tanh(1.6 * np.sin(2 * np.pi * np.cumsum(f) / sr)) * np.exp(-t * 2.4)
    elif kind == "snare":
        import scipy.signal

        nz = scipy.signal.sosfilt(scipy.signal.butter(2, [900, 9000], "band", fs=sr, output="sos"), rng.standard_normal(len(t)))
        s = nz * np.exp(-t * 18) * 0.9 + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 28) * 0.7
    elif kind == "clap":
        import scipy.signal

        nz = scipy.signal.sosfilt(scipy.signal.butter(2, [800, 6000], "band", fs=sr, output="sos"), rng.standard_normal(len(t)))
        env = np.zeros_like(t)
        for k, d in enumerate([0, 0.011, 0.022]):
            env += (t >= d) * np.exp(-(t - d).clip(0) * (90 if k < 2 else 16))
        s = nz * env
    else:
        import scipy.signal

        t = t[: int(sr * 0.12)]
        s = scipy.signal.sosfilt(scipy.signal.butter(4, 7000, "high", fs=sr, output="sos"), rng.standard_normal(len(t))) * np.exp(-t * 45)
    s = s / (np.abs(s).max() + 1e-9) * 0.9
    fade = int(sr * 0.01)
    s[-fade:] *= np.linspace(1, 0, fade)
    return s.astype(np.float32)


def load_drum_sample(spec: str, sr: int, pdir: Path | None = None) -> np.ndarray | None:
    from .project import load_audio

    if not spec or spec in ("off", "orig"):
        return None
    if spec.startswith("synth:"):
        return synth_drum(spec[6:], sr)
    if spec.startswith("lib:"):
        from .extras import sample_path

        p = sample_path(spec)
    elif pdir is not None:
        p = (pdir / "samples" / spec).resolve()
        if not str(p).startswith(str((pdir / "samples").resolve())):
            p = None
    else:
        p = None
    if not p or not Path(p).exists():
        return None
    s, _ = load_audio(Path(p), sr)
    s = s.mean(axis=0)[: sr * 2]
    i = int(np.argmax(np.abs(s) > np.abs(s).max() * 0.2)) if s.size else 0
    s = s[max(0, i - int(0.001 * sr)):]
    return (s / (np.abs(s).max() + 1e-9) * 0.9).astype(np.float32)


CLASS = {"kick": {35, 36}, "snare": {37, 38, 39, 40}, "hat": {42, 44, 46}}


def drum_replace(y, sr, kick="synth:kick", snare="synth:snare", hat="off", level_db=0.0, mode="layer", follow=True,
                 sensitivity=0.5, pdir=None, progress=None):
    import scipy.signal

    from . import drums

    y = np.atleast_2d(y).astype(np.float32)
    mono = y.mean(axis=0)
    ev = drums.transcribe_drums(mono, sr, sensitivity)
    if progress:
        progress(0.5)
    samples = {k: load_drum_sample(v, sr, pdir) for k, v in (("kick", kick), ("snare", snare), ("hat", hat))}
    bands = {"kick": scipy.signal.butter(2, 150, "low", fs=sr, output="sos"),
             "snare": scipy.signal.butter(2, [150, 6000], "band", fs=sr, output="sos"),
             "hat": scipy.signal.butter(2, 6000, "high", fs=sr, output="sos")}
    filt = {k: np.abs(scipy.signal.sosfiltfilt(b, mono)) for k, b in bands.items() if samples.get(k) is not None}
    layer = np.zeros(len(mono), np.float32)
    counts = {"kick": 0, "snare": 0, "hat": 0}
    g = 10 ** (level_db / 20)
    for e in ev:
        cls = next((k for k, v in CLASS.items() if e["note"] in v), None)
        s = samples.get(cls) if cls else None
        if s is None:
            continue
        t0 = int(e["t"] * sr)
        a, b = max(0, t0 - int(0.02 * sr)), min(len(mono), t0 + int(0.03 * sr))
        env = filt[cls][a:b]
        if len(env) > 4:
            pk = env.max()
            k = int(np.argmax(env > pk * 0.3))
            t0 = a + k
        vel = (e.get("vel", 100) / 127.0) if follow else 0.85
        n = min(len(s), len(layer) - t0)
        if n <= 0:
            continue
        layer[t0: t0 + n] += s[:n] * vel * g
        counts[cls] += 1
    if mode == "only":
        out = np.vstack([layer, layer])
    else:
        out = y + layer[None, :]
    pk = float(np.abs(out).max())
    if pk > 0.99:
        out *= 0.98 / pk
    if progress:
        progress(1.0)
    return out.astype(np.float32), {"kick": counts["kick"], "snare": counts["snare"], "hat": counts["hat"]}


def quantize_audio(y, sr, step, offset=0.0, strength=0.8, max_shift=None, progress=None):
    import librosa

    from .vocal import _wsola

    y = np.atleast_2d(y).astype(np.float32)
    mono = y.mean(axis=0)
    ons = librosa.onset.onset_detect(y=mono, sr=sr, hop_length=256, backtrack=True, units="time")
    if progress:
        progress(0.3)
    lim = max_shift if max_shift else step * 0.45
    t_in, t_out = [0.0], [0.0]
    moved = []
    for t in ons:
        g = offset + round((t - offset) / step) * step
        d = g - t
        if abs(d) > lim:
            continue
        to = t + strength * d
        if to > t_out[-1] + 0.02 and t > t_in[-1] + 0.02:
            t_in.append(float(t))
            t_out.append(float(to))
            moved.append(abs(strength * d))
    end = y.shape[1] / sr
    t_in.append(end)
    t_out.append(t_out[-1] + (end - t_in[-2]))
    res = _wsola(y, sr, np.array(t_out), np.array(t_in), frame=1024, hs=256, tol=128)
    L = y.shape[1]
    res = res[:, :L] if res.shape[1] >= L else np.pad(res, ((0, 0), (0, L - res.shape[1])))
    if progress:
        progress(1.0)
    return res.astype(np.float32), {"onsets": len(moved), "avg_shift_ms": round(float(np.mean(moved)) * 1000, 1) if moved else 0.0}
