from __future__ import annotations

import numpy as np
import librosa

HOP = 256


def onset_envelope(y: np.ndarray, sr: int, low_only: bool = False) -> np.ndarray:
    if low_only:
        S = np.abs(librosa.stft(y, n_fft=2048, hop_length=HOP))
        freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
        S = S[(freqs >= 30) & (freqs <= 160)]
        S = librosa.amplitude_to_db(S, ref=np.max)
        env = np.maximum(0, np.diff(S, axis=1, prepend=S[:, :1])).mean(axis=0)
    else:
        env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP, aggregate=np.median)
    env = env - np.percentile(env, 20)
    env[env < 0] = 0
    m = np.percentile(env, 99.5)
    return env / m if m > 0 else env


def _grid_score(env: np.ndarray, fps: float, bpm: float, phase: float, subdiv: int = 2) -> float:
    period = 60.0 / bpm / subdiv
    n = len(env)
    t = phase + period * np.arange(int((n / fps - phase) / period))
    idx = np.round(t * fps).astype(int)
    idx = idx[(idx >= 1) & (idx < n - 1)]
    if len(idx) == 0:
        return 0.0
    vals = np.maximum(np.maximum(env[idx], env[idx - 1]), env[idx + 1])
    w = np.where(np.arange(len(idx)) % subdiv == 0, 1.0, 0.6)
    return float(np.sum(vals * w) / len(idx))


def estimate_grid(perc: np.ndarray, sr: int, bpm_hint: float | None = None) -> dict:
    env = onset_envelope(perc, sr)
    fps = sr / HOP
    if bpm_hint:
        cand = [bpm_hint]
    else:
        tempo, beats = librosa.beat.beat_track(onset_envelope=env, sr=sr, hop_length=HOP, units="time",
                                               start_bpm=110, tightness=120)
        t0 = float(np.atleast_1d(tempo)[0])
        cand = [t0]
        if len(beats) > 8:
            d = np.diff(beats)
            med = np.median(d[(d > 0.25) & (d < 1.5)]) if np.any((d > 0.25) & (d < 1.5)) else 60 / t0
            cand.append(60.0 / med)
        for c in list(cand):
            cand += [c * 2, c / 2, c * 1.5, c * 2 / 3]
        cand = [c for c in cand if 60 <= c <= 200]
        uniq = []
        for c in sorted(cand):
            if not uniq or c > uniq[-1] * 1.02:
                uniq.append(c)
        cand = uniq
    best = (-1, 120.0, 0.0)
    for c in cand:
        for bpm in np.arange(c * 0.985, c * 1.015, 0.05):
            period = 60.0 / bpm
            for ph in np.arange(0, period, 0.015):
                s = _grid_score(env, fps, bpm, ph)
                pref = 1.0 if 80 <= bpm <= 155 else 0.93
                if s * pref > best[0]:
                    best = (s * pref, bpm, ph)
    _, bpm, ph = best
    period = 60.0 / bpm
    for step_b, step_p in ((0.01, 0.002),):
        top = best
        for b in np.arange(bpm - 0.1, bpm + 0.1, step_b):
            for p in np.arange(ph - 0.016, ph + 0.016, step_p):
                s = _grid_score(env, fps, b, p)
                pref = 1.0 if 80 <= b <= 155 else 0.93
                if s * pref > top[0]:
                    top = (s * pref, b, p)
        _, bpm, ph = top
    r = round(bpm)
    if abs(bpm - r) < 0.12 and not bpm_hint:
        best_ph = max(np.arange(ph - 0.015, ph + 0.015, 0.001), key=lambda p: _grid_score(env, fps, r, p))
        if _grid_score(env, fps, r, best_ph) >= 0.97 * _grid_score(env, fps, bpm, ph):
            bpm, ph = float(r), float(best_ph)
    period = 60.0 / bpm
    ph = ph % period
    try:
        ons = librosa.onset.onset_detect(y=perc, sr=sr, hop_length=64, units="time", backtrack=True)
        half = period / 2
        dev = ((ons - ph + half / 2) % half) - half / 2
        dev = dev[np.abs(dev) < 0.05]
        if len(dev) >= 8:
            ph = (ph + float(np.median(dev))) % period
    except Exception:
        pass
    dur = len(perc) / sr
    beats = ph + period * np.arange(int((dur - ph) / period) + 1)
    base = np.mean([_grid_score(env, fps, bpm, p) for p in np.linspace(0, period, 9)[:-1] + period / 17])
    conf = float(np.clip((_grid_score(env, fps, bpm, ph) - base) / (base + 1e-6), 0, 1))
    return {"bpm": float(round(bpm, 3)), "beat0": float(ph), "confidence": conf, "beats": beats.tolist()}


def estimate_downbeat(beats: list[float], sr: int, low: np.ndarray | None, harm: np.ndarray | None,
                      beats_per_bar: int = 4) -> int:
    beats = np.asarray(beats)
    if len(beats) < beats_per_bar * 2:
        return 0
    scores = np.zeros(beats_per_bar)
    if low is not None and len(low):
        env = onset_envelope(low, sr, low_only=True)
        fps = sr / HOP
        idx = np.clip(np.round(beats * fps).astype(int), 0, len(env) - 1)
        acc = np.array([env[max(0, i - 2): i + 3].max() for i in idx])
        for p in range(beats_per_bar):
            scores[p] += acc[p::beats_per_bar].mean() * 1.0 + acc[(p + beats_per_bar // 2) % beats_per_bar::beats_per_bar].mean() * 0.3
    if harm is not None and len(harm):
        chroma = librosa.feature.chroma_cqt(y=harm, sr=sr, hop_length=512)
        from .harmony import beat_sync
        frames = librosa.time_to_frames(beats, sr=sr, hop_length=512)
        sync = beat_sync(chroma, frames, aggregate=np.median)
        sync = sync / (np.linalg.norm(sync, axis=0, keepdims=True) + 1e-9)
        nov = np.concatenate([[0], 1 - np.sum(sync[:, 1:] * sync[:, :-1], axis=0)])
        nov = nov[: len(beats)]
        if nov.max() > 0:
            nov = nov / nov.max()
        for p in range(beats_per_bar):
            scores[p] += 1.5 * nov[p::beats_per_bar].mean()
    return int(np.argmax(scores))
