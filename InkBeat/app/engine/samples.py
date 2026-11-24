from __future__ import annotations

import numpy as np

from .harmony import NOTE_NAMES

DRUM_CLASSES = {
    "Kick": ([36], 0.60, 0.16),
    "Snare": ([38, 39, 40], 0.50, 0.14),
    "Closed Hat": ([42, 44], 0.25, 0.06),
    "Open Hat": ([46], 0.70, 0.20),
    "Crash": ([49, 57], 2.20, 0.45),
    "Ride": ([51], 1.20, 0.30),
    "Tom": ([45, 47, 48, 50], 0.80, 0.20),
}
FPC_PAD = {"Kick": 36, "Snare": 38, "Closed Hat": 42, "Open Hat": 46, "Crash": 49, "Ride": 51, "Tom": 45}


def note_name(m: int) -> str:
    return f"{NOTE_NAMES[m % 12]}{m // 12 - 1}"


def _finish(seg: np.ndarray, sr: int, fade_out_s: float = 0.02, floor_db: float = -55.0) -> np.ndarray:
    seg = np.atleast_2d(seg).astype(np.float32)
    if seg.shape[1] < 16:
        return seg
    env = np.abs(seg).max(axis=0)
    peak = float(env.max())
    if peak <= 1e-6:
        return seg
    hop = max(1, int(0.005 * sr))
    frames = env[: len(env) // hop * hop].reshape(-1, hop).max(axis=1)
    thr = peak * 10 ** (floor_db / 20)
    above = np.where(frames > thr)[0]
    if len(above):
        end = min(seg.shape[1], (above[-1] + 2) * hop)
        seg = seg[:, :end]
    n = seg.shape[1]
    fi = min(n, int(0.001 * sr))
    if fi > 1:
        seg[:, :fi] *= np.linspace(0, 1, fi)
    fo = min(n // 3, max(8, int(fade_out_s * sr)))
    seg[:, -fo:] *= np.linspace(1, 0, fo) ** 2
    seg *= (10 ** (-1 / 20)) / peak
    return seg


def _zero_cross_before(y: np.ndarray, i: int, max_back: int) -> int:
    m = y.mean(axis=0) if y.ndim > 1 else y
    lo = max(1, i - max_back)
    seg = m[lo:i + 1]
    zc = np.where(np.signbit(seg[1:]) != np.signbit(seg[:-1]))[0]
    return lo + int(zc[-1]) if len(zc) else max(0, i)


def drum_hits(y: np.ndarray, sr: int, events: list[dict], per_class: int = 3) -> list[dict]:
    y = np.atleast_2d(y)
    all_times = np.array([e["t"] for e in events]) if events else np.array([])
    hat_like = {42, 44, 46, 49, 51, 57}
    body_times = np.array([e["t"] for e in events if e["note"] not in hat_like]) if events else np.array([])
    out = []
    for name, (notes, max_len, min_gap) in DRUM_CLASSES.items():
        times = body_times if name == "Kick" else all_times
        cands = []
        for e in events:
            if e["note"] not in notes:
                continue
            t = e["t"]
            later = times[times > t + 0.025]
            nxt = float(later[0] - t) if len(later) else 10.0
            sim = np.sum(np.abs(times - t) <= 0.025) - 1
            prev = times[times < t - 0.025]
            prv = float(t - prev[-1]) if len(prev) else 10.0
            if nxt < min_gap:
                continue
            score = e["vel"] / 127 + 0.6 * min(nxt / max_len, 1.0) + 0.15 * min(prv / 0.3, 1) - 0.5 * sim
            cands.append((score, t, nxt, sim))
        if not cands:
            continue
        cands.sort(reverse=True)
        picked = []
        for score, t, nxt, sim in cands:
            if all(abs(t - p_[1]) > 1.0 for p_ in picked):
                picked.append((score, t, nxt, sim))
            if len(picked) >= per_class:
                break
        for k, (score, t, nxt, sim) in enumerate(picked):
            a = int(max(0, t - 0.004) * sr)
            a = _zero_cross_before(y, a, int(0.003 * sr))
            b = min(y.shape[1], int((t + min(max_len, nxt - 0.006)) * sr))
            if b - a < int(0.03 * sr):
                continue
            raw = y[:, a:b].astype(np.float32)
            if name == "Kick":
                raw = _lowpass_tail(raw, sr, 0.02, 3500)
            seg = _finish(raw, sr, fade_out_s=0.015 if name in ("Kick", "Snare", "Closed Hat", "Tom") else 0.06)
            out.append({"kind": "drum", "name": f"{name} {k + 1}", "class": name, "audio": seg,
                        "time": round(t, 3), "clean": bool(sim == 0), "fpc_pad": FPC_PAD.get(name)})
    return out


def _lowpass_tail(seg: np.ndarray, sr: int, keep_s: float, cutoff: float) -> np.ndarray:
    from scipy.signal import butter, sosfiltfilt

    if seg.shape[1] < int(0.05 * sr):
        return seg
    sos = butter(4, cutoff, "lowpass", fs=sr, output="sos")
    lp = sosfiltfilt(sos, seg, axis=1).astype(np.float32)
    k = int(keep_s * sr)
    x = int(0.008 * sr)
    w = np.ones(seg.shape[1], np.float32)
    w[k:k + x] = np.linspace(1, 0, x)
    w[k + x:] = 0
    return seg * w + lp * (1 - w)


def melodic_oneshot(y: np.ndarray, sr: int, notes, track_name: str, mono: bool) -> list[dict]:
    y = np.atleast_2d(y)
    res = []
    if not notes:
        return res
    starts = np.array([n.start for n in notes])
    pitches = np.array([n.pitch for n in notes])
    med = float(np.median(pitches))
    best = None
    for i, n in enumerate(notes):
        d = n.end - n.start
        if not 0.25 <= d <= 3.0:
            continue
        others = np.where((starts > n.start - 0.03) & (starts < n.end + 0.15))[0]
        others = others[others != i]
        if len(others):
            continue
        score = n.amp * 1.2 + min(d, 1.5) * 0.5 - abs(n.pitch - med) / 24
        if best is None or score > best[0]:
            best = (score, n)
    if best:
        n = best[1]
        a = _zero_cross_before(y, int(max(0, n.start - 0.008) * sr), int(0.004 * sr))
        later = starts[starts > n.end]
        tail = min(0.6, (later[0] - n.end - 0.01) if len(later) else 0.6)
        b = min(y.shape[1], int((n.end + max(0.05, tail)) * sr))
        res.append({"kind": "oneshot", "name": f"{track_name} - note {note_name(n.pitch)}", "root": int(n.pitch),
                    "root_name": note_name(n.pitch), "audio": _finish(y[:, a:b], sr, 0.08), "time": round(n.start, 3)})
    if not mono:
        groups = {}
        for n in notes:
            key = round(n.start / 0.04)
            groups.setdefault(key, []).append(n)
        cands = []
        for key, g in groups.items():
            if len(g) < 3:
                continue
            s = min(x.start for x in g)
            e = max(x.end for x in g)
            later = starts[starts > s + 0.06]
            gap = (later[0] - s) if len(later) else 2.0
            if gap < 0.25:
                continue
            cands.append((np.mean([x.amp for x in g]) + min(gap, 1.5) * 0.4, s, min(e, s + gap), sorted({x.pitch for x in g})))
        if cands:
            cands.sort(reverse=True)
            _, s, e, ps = cands[0]
            a = _zero_cross_before(y, int(max(0, s - 0.008) * sr), int(0.004 * sr))
            b = min(y.shape[1], int((e + 0.25) * sr))
            names = " ".join(note_name(p) for p in ps[:5])
            res.append({"kind": "chord", "name": f"{track_name} - chord stab", "notes": ps, "notes_name": names,
                        "audio": _finish(y[:, a:b], sr, 0.1), "time": round(s, 3)})
    return res


def vocal_chops(y: np.ndarray, sr: int, sections_sec: list[tuple[float, float, str]], max_chops: int = 8) -> list[dict]:
    import librosa

    y = np.atleast_2d(y)
    m = y.mean(axis=0)
    hop = 512
    rms = librosa.feature.rms(y=m, hop_length=hop)[0]
    if rms.max() <= 0:
        return []
    thr = np.percentile(rms, 95) * 10 ** (-32 / 20)
    active = rms > thr
    gap = int(0.18 * sr / hop)
    idx = np.where(active)[0]
    phrases = []
    if len(idx):
        s = idx[0]
        p = idx[0]
        for i in idx[1:]:
            if i - p > gap:
                phrases.append((s, p))
                s = i
            p = i
        phrases.append((s, p))
    fps = sr / hop
    def split(a, b):
        if (b - a) / fps <= 4.5:
            return [(a, b)]
        lo, hi = a + int(1.5 * fps), b - int(1.5 * fps)
        if hi <= lo:
            return [(a, b)]
        c = lo + int(np.argmin(rms[lo:hi]))
        return split(a, c) + split(c + 1, b)
    phrases = [q for a, b in phrases for q in split(a, b)]
    cands = []
    for a, b in phrases:
        t0, t1 = a * hop / sr, (b + 1) * hop / sr
        d = t1 - t0
        if not 0.35 <= d <= 6.0:
            continue
        energy = float(rms[a:b + 1].mean())
        sec = next((nm for (s0, s1, nm) in sections_sec if s0 <= t0 < s1), "")
        bonus = 0.25 if "Chorus" in sec or "Приспів" in sec else 0.0
        cands.append((energy / (rms.max() + 1e-9) + bonus + 0.1 * min(d, 2), t0, t1, sec))
    cands.sort(reverse=True)
    out = []
    for score, t0, t1, sec in cands[:max_chops]:
        a = int(max(0, t0 - 0.03) * sr)
        b = min(y.shape[1], int((t1 + 0.12) * sr))
        out.append({"kind": "vocal", "name": f"Vocal chop - {sec or 'phrase'} - {t0:0.1f}s", "audio": _finish(y[:, a:b], sr, 0.06),
                    "time": round(t0, 3), "section": sec})
    out.sort(key=lambda c: c["time"])
    for i, c in enumerate(out):
        c["name"] = f"Vocal chop {i + 1:02d} - {c['section'] or 'phrase'}"
    return out


def loop(y: np.ndarray, sr: int, t0: float, length: float) -> np.ndarray | None:
    y = np.atleast_2d(y)
    a = int(round(t0 * sr))
    n = int(round(length * sr))
    if a < 0:
        seg = np.pad(y[:, : max(0, a + n)], ((0, 0), (-a, 0)))
    else:
        seg = y[:, a: a + n]
    if seg.shape[1] < n:
        seg = np.pad(seg, ((0, 0), (0, n - seg.shape[1])))
    if np.sqrt(np.mean(seg ** 2)) < 1e-3:
        return None
    seg = seg.astype(np.float32).copy()
    f = int(0.003 * sr)
    seg[:, :f] *= np.linspace(0, 1, f)
    seg[:, -f:] *= np.linspace(1, 0, f)
    peak = float(np.abs(seg).max())
    if peak > 0.999:
        seg *= 0.999 / peak
    return seg
