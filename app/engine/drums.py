from __future__ import annotations

import numpy as np
import librosa
import scipy.ndimage
import scipy.signal

GM = {"kick": 36, "snare": 38, "clap": 39, "hat": 42, "hat_open": 46, "crash": 49, "ride": 51,
      "tom_low": 45, "tom_mid": 47, "tom_high": 50}
GM_NAMES = {36: "Kick", 38: "Snare", 39: "Clap", 42: "Closed Hat", 46: "Open Hat", 49: "Crash",
            51: "Ride", 45: "Low Tom", 47: "Mid Tom", 50: "High Tom"}

HOP = 128
NFFT = 2048


def _band(S, freqs, lo, hi):
    m = (freqs >= lo) & (freqs < hi)
    return S[m].sum(axis=0)


def _flux(comp, lag=4):
    d = np.zeros_like(comp)
    d[lag:] = comp[lag:] - comp[:-lag]
    d[d < 0] = 0
    return d


def _peaks(flux, fps, thr_rel, min_gap_s, floor):
    if flux.max() <= 0:
        return np.array([], dtype=int)
    norm = flux / (np.percentile(flux, 99.7) + 1e-9)
    win = max(3, int(0.25 * fps))
    local = scipy.ndimage.uniform_filter1d(norm, win * 2 + 1)
    pk, _ = scipy.signal.find_peaks(norm, height=np.maximum(local + thr_rel, floor),
                                    distance=max(1, int(min_gap_s * fps)))
    return pk


def transcribe_drums(y: np.ndarray, sr: int, sensitivity: float = 0.5) -> list[dict]:
    if len(y) < sr // 4 or np.max(np.abs(y)) < 1e-4:
        return []
    y = y / (np.max(np.abs(y)) + 1e-9)
    S = np.abs(librosa.stft(y, n_fft=NFFT, hop_length=HOP)) ** 2
    freqs = librosa.fft_frequencies(sr=sr, n_fft=NFFT)
    fps = sr / HOP

    bands = {
        "low": _band(S, freqs, 30, 130),
        "lowmid": _band(S, freqs, 130, 300),
        "mid": _band(S, freqs, 300, 1500),
        "snap": _band(S, freqs, 1500, 6000),
        "high": _band(S, freqs, 7000, 16000),
    }
    lin = {k: v / (np.percentile(v, 99.5) + 1e-12) for k, v in bands.items()}
    lag = max(2, int(0.012 * fps))
    flux = {k: _flux(np.log1p(60 * np.sqrt(v)), lag) for k, v in lin.items()}

    s = (sensitivity - 0.5)
    thr = 0.20 - 0.18 * s
    floor = 0.13 - 0.1 * s

    kicks = _peaks(flux["low"], fps, thr, 0.07, floor)
    snare_f = flux["snap"] * 0.7 + flux["lowmid"] * 0.3 + flux["mid"] * 0.4
    snares = _peaks(snare_f, fps, thr + 0.02, 0.07, floor + 0.02)
    hats = _peaks(flux["high"], fps, thr, 0.045, floor)

    def near(arr, i, tol):
        if len(arr) == 0:
            return None
        j = np.searchsorted(arr, i)
        best = None
        for c in (j - 1, j):
            if 0 <= c < len(arr) and abs(arr[c] - i) <= tol:
                if best is None or abs(arr[c] - i) < abs(best - i):
                    best = arr[c]
        return best

    def peak_val(sig, i):
        return float(sig[max(0, i - 1): i + W].max())

    def rise(k, i, pre=6, post=None):
        post = post or W
        a = lin[k][max(0, i - pre): i].mean() if i > 0 else 0.0
        b = lin[k][i: i + post].max()
        return b / (a + 1e-3)

    def decay(k, i, t_s):
        seg = lin[k][i: i + W]
        pk_i = i + int(np.argmax(seg))
        pk = seg.max() + 1e-9
        j = pk_i + int(t_s * fps)
        if j >= len(lin[k]):
            return 0.0
        return float(lin[k][pk_i + 2: j + 1].min() / pk)

    tol = int(0.03 * fps)
    W = max(4, int(0.04 * fps))
    events = []
    kick_set = []
    for i in kicks:
        r = rise("low", i)
        if r < 1.6 or lin["low"][i: i + W].max() < 0.12:
            continue
        kick_set.append(i)
        events.append((i, GM["kick"], peak_val(lin["low"], i)))
    kick_arr = np.array(kick_set, dtype=int)

    snare_set = []
    for i in snares:
        k = near(kick_arr, i, tol)
        snap_rise = rise("snap", i)
        if k is not None:
            if snap_rise < 2.5 and lin["snap"][i: i + W].max() < 0.35:
                continue
        if snap_rise < 1.5 and rise("lowmid", i) < 2.0:
            continue
        if max(lin["snap"][i: i + W].max(), lin["lowmid"][i: i + W].max()) < 0.1:
            continue
        snare_set.append(i)
        noise = lin["snap"][i: i + W].max()
        body = lin["lowmid"][i: i + W].max()
        if noise < 0.12 and body > 0.3 and k is None:
            cen = _centroid(S, freqs, i, 60, 400)
            note = GM["tom_low"] if cen < 120 else GM["tom_mid"] if cen < 200 else GM["tom_high"]
            events.append((i, note, body))
        else:
            events.append((i, GM["snare"], peak_val(lin["snap"], i) * 0.6 + peak_val(lin["lowmid"], i) * 0.4))
    snare_arr = np.array(snare_set, dtype=int)

    last_crash = -10 ** 9
    for i in hats:
        r = rise("high", i)
        if r < 1.4 or lin["high"][i: i + W].max() < 0.06:
            continue
        sn = near(snare_arr, i, tol)
        hv = lin["high"][i: i + W].max()
        if sn is not None:
            ratio = hv / (lin["snap"][sn: sn + W].max() + 1e-6)
            if ratio < 0.55 and r < 3.0:
                continue
        d_short, d_long = decay("high", i, 0.10), decay("high", i, 0.5)
        if d_long > 0.12 and hv > 0.3 and i - last_crash > fps * 1.0:
            note = GM["crash"]
            last_crash = i
        elif d_short > 0.12:
            note = GM["hat_open"]
        else:
            note = GM["hat"]
        events.append((i, note, peak_val(lin["high"], i)))

    out = []
    by_note: dict[int, list] = {}
    for i, n, v in events:
        by_note.setdefault(n, []).append((i, v))
    for n, lst in by_note.items():
        vals = np.array([v for _, v in lst])
        ref = np.percentile(vals, 90) + 1e-9
        for i, v in lst:
            vel = int(np.clip(50 + 77 * (v / ref) ** 0.6, 25, 127))
            out.append({"t": float(i * HOP / sr), "note": int(n), "vel": vel})
    out.sort(key=lambda e: (e["t"], e["note"]))
    return out


def _centroid(S, freqs, i, lo, hi):
    m = (freqs >= lo) & (freqs < hi)
    seg = S[m, i: i + 4].sum(axis=1)
    return float((freqs[m] * seg).sum() / (seg.sum() + 1e-12))
