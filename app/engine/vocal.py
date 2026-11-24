from __future__ import annotations

from pathlib import Path

import numpy as np

from .jsonio import read_json, write_json


def _hz_to_midi(f):
    return 69 + 12 * np.log2(np.maximum(f, 1e-6) / 440.0)


def _pitch_cache(pdir: Path, src_path: Path, y, sr, progress=None):
    from .processing import track_pitch

    key = f"{src_path.stem}_{int(src_path.stat().st_mtime)}"
    f = pdir / "cache" / f"pitch_{key}.npz"
    if f.exists():
        d = np.load(f)
        return d["times"], d["f0"]
    times, f0 = track_pitch(np.atleast_2d(y).mean(axis=0), sr, progress=progress)
    for old in (pdir / "cache").glob(f"pitch_{src_path.stem}_*.npz"):
        old.unlink(missing_ok=True)
    np.savez_compressed(f, times=times, f0=f0)
    return times, f0


def blobs_from_f0(times, f0, rms_db):
    import scipy.signal

    voiced = f0 > 0
    midi = np.where(voiced, _hz_to_midi(f0), 0.0)
    sm = midi.copy()
    if voiced.sum() > 7:
        sm[voiced] = scipy.signal.medfilt(midi[voiced], 7)
    dt = times[1] - times[0] if len(times) > 1 else 0.0116
    blobs = []
    i, n = 0, len(f0)
    while i < n:
        if not voiced[i]:
            i += 1
            continue
        j = i
        ref = sm[i]
        run = []
        while j < n and voiced[j]:
            run.append(sm[j])
            ref = float(np.median(run[-25:]))
            if j + 3 < n and all(voiced[j + k] and abs(sm[j + k] - ref) > 0.75 for k in range(1, 4)) and j - i > 4:
                j += 1
                break
            j += 1
        if (j - i) * dt >= 0.06:
            seg = midi[i:j]
            c = float(np.median(sm[i:j]))
            amp = float(np.mean(rms_db[min(i, len(rms_db) - 1): max(i + 1, min(j, len(rms_db)))]))
            blobs.append({"a": round(i * dt, 4), "b": round(j * dt, 4), "c": round(c, 3), "amp": round(amp, 1),
                          "lo": round(float(seg.min()), 2), "hi": round(float(seg.max()), 2)})
        i = j
    return blobs


def pitch_map(pdir: Path, src_path: Path, progress=None) -> dict:
    from .project import load_audio

    y, sr = load_audio(src_path)
    times, f0 = _pitch_cache(pdir, src_path, y, sr, progress)
    import librosa

    mono = np.atleast_2d(y).mean(axis=0)
    hop = int(round((times[1] - times[0]) * sr)) if len(times) > 1 else 512
    rms = librosa.feature.rms(y=mono, frame_length=hop * 4, hop_length=hop)[0]
    rms_db = 20 * np.log10(rms + 1e-6)
    rms_db = np.pad(rms_db, (0, max(0, len(times) - len(rms_db))))[: len(times)]
    blobs = blobs_from_f0(times, f0, rms_db)
    step = max(1, int(round(0.01 / (times[1] - times[0])))) if len(times) > 1 else 1
    curve = np.where(f0 > 0, _hz_to_midi(f0), 0.0)[::step]
    return {"dt": float((times[1] - times[0]) * step) if len(times) > 1 else 0.01, "curve": [round(float(x), 2) for x in curve],
            "blobs": blobs, "dur": float(y.shape[1] / sr)}


def pitch_edit(pdir: Path, src_path: Path, y, sr, edits: list[dict], progress=None):
    import scipy.ndimage
    import scipy.signal

    from .processing import psola

    times, f0 = _pitch_cache(pdir, src_path, y, sr, (lambda p: progress(p * 0.5)) if progress else None)
    voiced = f0 > 0
    midi = np.where(voiced, _hz_to_midi(f0), 0.0)
    dt = times[1] - times[0]
    corr = np.zeros_like(midi)
    mask = np.zeros(len(midi), bool)
    k = max(3, int(0.15 / dt) | 1)
    for e in edits:
        i0, i1 = int(max(0, e["a"] / dt)), int(min(len(midi), e["b"] / dt + 1))
        if i1 - i0 < 3:
            continue
        seg = midi[i0:i1]
        v = voiced[i0:i1]
        if not v.any():
            continue
        med = seg.copy()
        if v.sum() > 5:
            med[v] = scipy.signal.medfilt(seg[v], 5)
        slow = med.copy()
        if v.sum() > k:
            slow[v] = scipy.ndimage.uniform_filter1d(med[v], k)
        c = float(e.get("c", np.median(med[v])))
        shift = float(e.get("shift", 0.0))
        drift = float(e.get("drift", 0.0))
        vib = float(e.get("vib", 0.0))
        target = c + shift + (slow - c) * (1 - drift) + (seg - slow) * (1 - vib)
        cc = np.where(v, target - seg, 0.0)
        ramp = min(len(cc) // 3, max(1, int(0.02 / dt)))
        if ramp > 0:
            w = np.ones(len(cc))
            w[:ramp] = np.linspace(0, 1, ramp)
            w[-ramp:] = np.minimum(w[-ramp:], np.linspace(1, 0, ramp))
            cc *= w
        corr[i0:i1] = cc
        mask[i0:i1] = True
    if progress:
        progress(0.6)
    ratio = np.where(voiced, 2 ** (corr / 12.0), 1.0)
    out = psola(y, sr, times, f0, ratio)
    m = np.repeat(mask.astype(np.float32), int(round(dt * sr)))
    m = np.pad(m, (0, max(0, y.shape[1] - len(m))))[: y.shape[1]]
    fade = int(0.03 * sr)
    if fade > 1:
        m = np.convolve(m, np.ones(fade) / fade, mode="same")
    res = y * (1 - m) + out * m
    if progress:
        progress(1.0)
    return res.astype(np.float32), {"edited_notes": len(edits),
                                    "avg_shift_cents": round(float(np.mean(np.abs(corr[mask]))) * 100, 1) if mask.any() else 0.0}


def breath_click(y, sr, breath_db=14.0, clicks=True, sensitivity=0.5, progress=None):
    import librosa

    y = np.atleast_2d(y).astype(np.float32).copy()
    mono = y.mean(axis=0)
    hop = int(sr * 0.01)
    S = np.abs(librosa.stft(mono, n_fft=2048, hop_length=hop))
    rms = librosa.feature.rms(S=S, frame_length=2048)[0]
    rdb = 20 * np.log10(rms + 1e-7)
    flat = librosa.feature.spectral_flatness(S=S)[0]
    cent = librosa.feature.spectral_centroid(S=S, sr=sr)[0]
    f0, vflag, _ = librosa.pyin(librosa.resample(mono, orig_sr=sr, target_sr=16000), fmin=70, fmax=1000, sr=16000,
                                frame_length=1024, hop_length=160, fill_na=0.0)
    voiced = np.zeros(len(rdb), bool)
    vf = np.asarray(vflag, bool)
    voiced[: min(len(rdb), len(vf))] = vf[: len(rdb)]
    if progress:
        progress(0.4)
    floor = np.percentile(rdb, 8)
    act = rdb[voiced] if voiced.any() else rdb
    phrase = np.median(act) if len(act) else -20
    lo, hi = floor + 5 + 4 * (1 - sensitivity), phrase - 6 + 4 * sensitivity
    cand = (~voiced) & (rdb > lo) & (rdb < hi) & (flat > 0.002) & (cent < 4200 + 800 * sensitivity)
    cand = np.convolve(cand.astype(float), np.ones(5) / 5, mode="same") > 0.5
    gains = np.ones(len(rdb), np.float32)
    count = 0
    i = 0
    att = 10 ** (-breath_db / 20)
    while i < len(cand):
        if not cand[i]:
            i += 1
            continue
        j = i
        while j < len(cand) and cand[j]:
            j += 1
        dur = (j - i) * 0.01
        near_v_before = voiced[max(0, i - 3): i].any()
        near_v_after = voiced[j: j + 3].any()
        if 0.12 <= dur <= 1.2 and not (near_v_before and near_v_after and dur < 0.25):
            gains[i:j] = att
            count += 1
        i = j
    g = np.repeat(gains, hop)
    g = np.pad(g, (0, max(0, y.shape[1] - len(g))), constant_values=1.0)[: y.shape[1]]
    sm = int(0.015 * sr)
    g = np.convolve(g, np.ones(sm) / sm, mode="same")
    y *= g
    nclick = 0
    if clicks:
        import scipy.signal

        hp = scipy.signal.sosfilt(scipy.signal.butter(4, 2500, "high", fs=sr, output="sos"), mono)
        a = np.abs(hp)
        win = max(8, int(0.02 * sr))
        loc = np.sqrt(np.convolve(a ** 2, np.ones(win) / win, mode="same"))
        spikes = np.nonzero(a > (9 - 4 * sensitivity) * (loc + 1e-5))[0]
        lp = scipy.signal.butter(4, 3000, "low", fs=sr, output="sos")
        w = max(4, int(0.0025 * sr))
        last = -10 * w
        for s0 in spikes:
            if s0 - last < 4 * w or s0 < 4 * w or s0 > y.shape[1] - 4 * w:
                continue
            a0, a1 = s0 - 3 * w, s0 + 3 * w
            hw = np.clip(np.hanning(a1 - a0) * 1.6, 0, 1)
            for c in range(y.shape[0]):
                seg = y[c, a0:a1].copy()
                rep = scipy.signal.medfilt(seg, 2 * int(0.0012 * sr) + 1)
                rep = scipy.signal.sosfiltfilt(lp, rep)
                y[c, a0:a1] = seg * (1 - hw) + rep * hw
            last = s0
            nclick += 1
    if progress:
        progress(1.0)
    return y, {"breaths": count, "clicks": nclick}


def rider(y, sr, amount=0.7, range_db=6.0, target_db=None, progress=None):
    y = np.atleast_2d(y).astype(np.float32)
    mono = y.mean(axis=0)
    hop = int(sr * 0.01)
    n = len(mono) // hop
    fr = mono[: n * hop].reshape(n, hop)
    rms = np.sqrt(np.mean(fr ** 2, axis=1) + 1e-12)
    win = 8
    rms = np.sqrt(np.convolve(rms ** 2, np.ones(win) / win, mode="same"))
    db = 20 * np.log10(rms + 1e-9)
    floor = np.percentile(db, 10)
    active = db > max(floor + 12, db.max() - 40)
    tgt = float(target_db) if target_db is not None else (float(np.median(db[active])) if active.any() else -20.0)
    want = np.where(active, np.clip((tgt - db) * amount, -range_db, range_db), 0.0)
    a_up, a_dn = np.exp(-0.01 / 0.25), np.exp(-0.01 / 0.08)
    g = np.zeros_like(want)
    prev = 0.0
    for i in range(len(want)):
        a = a_dn if want[i] < prev else a_up
        prev = a * prev + (1 - a) * want[i]
        g[i] = prev
    gl = 10 ** (np.repeat(g, hop) / 20)
    gl = np.pad(gl, (0, y.shape[1] - len(gl)), constant_values=gl[-1] if len(gl) else 1.0)
    if progress:
        progress(1.0)
    spread_before = float(np.std(db[active])) if active.any() else 0.0
    db2 = db + g
    spread_after = float(np.std(db2[active])) if active.any() else 0.0
    return (y * gl).astype(np.float32), {"target_db": round(tgt, 1), "spread_before_db": round(spread_before, 1),
                                          "spread_after_db": round(spread_after, 1)}


def _features(mono, sr):
    import librosa

    y = librosa.resample(mono, orig_sr=sr, target_sr=16000)
    hop = 160
    mf = librosa.feature.mfcc(y=y, sr=16000, n_mfcc=14, hop_length=hop, n_fft=512)[1:]
    on = librosa.onset.onset_strength(y=y, sr=16000, hop_length=hop)
    rms = librosa.feature.rms(y=y, hop_length=hop, frame_length=512)[0]
    L = min(mf.shape[1], len(on), len(rms))
    F = np.vstack([mf[:, :L] / 20.0, on[None, :L] / (on.max() + 1e-9) * 3, np.log(rms[None, :L] + 1e-4) / 4])
    return F, rms[:L], 0.01


def _wsola(y, sr, tmap_out, tmap_in, frame=1024, hs=512, tol=256):
    C, N = y.shape
    L = int(tmap_out[-1] * sr) + frame
    out = np.zeros((C, L + frame), np.float32)
    norm = np.zeros(L + frame, np.float32)
    win = np.hanning(frame).astype(np.float32)
    d = 4
    mono = y.mean(axis=0)
    prev_end = None
    k = 0
    while k * hs < L:
        to = k * hs / sr
        ti = float(np.interp(to, tmap_out, tmap_in))
        pos = int(ti * sr)
        if prev_end is not None:
            lo, hi = max(0, pos - tol), min(N - frame, pos + tol)
            if hi > lo:
                ref = mono[prev_end: prev_end + frame: d]
                cand = mono[lo: hi + frame: d]
                if len(ref) == frame // d and len(cand) >= len(ref):
                    cc = np.correlate(cand, ref, mode="valid")
                    pos = lo + int(np.argmax(cc)) * d
        pos = int(np.clip(pos, 0, max(0, N - frame)))
        seg = y[:, pos: pos + frame]
        if seg.shape[1] < frame:
            seg = np.pad(seg, ((0, 0), (0, frame - seg.shape[1])))
        o = k * hs
        out[:, o: o + frame] += seg * win
        norm[o: o + frame] += win
        prev_end = pos + hs
        k += 1
    good = norm > 1e-3
    out[:, good] /= norm[good]
    return out[:, :L]


def _band_dtw(X, Y, rad, pen=0.15):
    n, m = X.shape[1], Y.shape[1]
    K = 2 * rad + 1
    cost = np.full((n, K), np.inf)
    for k in range(K):
        off = k - rad
        i0, i1 = max(0, -off), min(n, m - off)
        if i1 > i0:
            cost[i0:i1, k] = np.sqrt(((X[:, i0:i1] - Y[:, i0 + off: i1 + off]) ** 2).sum(axis=0))
    D = np.full((n, K), np.inf)
    B = np.zeros((n, K), np.int8)
    D[0] = cost[0]
    D[0, :rad] = np.inf
    for i in range(1, n):
        prev = D[i - 1]
        up = np.concatenate([prev[1:], [np.inf]]) + pen
        best = np.minimum(prev, up)
        bsel = np.where(prev <= up, 0, 1).astype(np.int8)
        row = cost[i] + best
        for k in range(1, K):
            alt = row[k - 1] - cost[i, k - 1] + cost[i, k] + pen if np.isfinite(row[k - 1]) else np.inf
            if alt < row[k]:
                row[k] = alt
                bsel[k] = 2
        D[i] = row
        B[i] = bsel
    k = int(np.argmin(D[-1]))
    i = n - 1
    path = []
    guard = 0
    while i >= 0 and guard < 4 * (n + K):
        guard += 1
        path.append((i, i + k - rad))
        b = B[i, k]
        if i == 0:
            break
        if b == 0:
            i -= 1
        elif b == 1:
            i -= 1
            k += 1
        else:
            k -= 1
            if k < 0:
                k = 0
                i -= 1
    return np.array(path[::-1])


def align(y, sr, guide, strength=1.0, max_shift=0.15, progress=None):
    y = np.atleast_2d(y).astype(np.float32)
    Fg, rg, hop = _features(np.atleast_2d(guide).mean(axis=0), sr)
    Fy, ry, _ = _features(y.mean(axis=0), sr)
    if progress:
        progress(0.25)
    n = min(Fg.shape[1], Fy.shape[1])
    Fg, Fy = Fg[:, :n], Fy[:, :n]
    mu, sd = Fg.mean(axis=1, keepdims=True), Fg.std(axis=1, keepdims=True) + 1e-6
    rad = max(2, int(max_shift / hop))
    path = _band_dtw((Fy - mu) / sd, (Fg - mu) / sd, rad)
    if progress:
        progress(0.6)
    src = path[:, 0] * hop
    dst = path[:, 1] * hop
    grid = np.arange(0, n) * hop
    inv = np.interp(grid, dst, src)
    sm = max(3, int(0.08 / hop) | 1)
    inv = np.convolve(np.pad(inv, sm // 2, mode="edge"), np.ones(sm) / sm, mode="valid")
    inv = grid + strength * (inv - grid)
    inv = np.maximum.accumulate(inv)
    end = y.shape[1] / sr
    tout = np.concatenate([grid, [grid[-1] + max(0.0, end - inv[-1])]])
    tin = np.concatenate([inv, [end]])
    res = _wsola(y, sr, tout, tin)
    L = y.shape[1]
    res = res[:, :L] if res.shape[1] >= L else np.pad(res, ((0, 0), (0, L - res.shape[1])))
    shift = inv - grid
    act = rg[:n] > rg[:n].max() * 0.02
    if progress:
        progress(1.0)
    return res.astype(np.float32), {"avg_shift_ms": round(float(np.mean(np.abs(shift[act]))) * 1000, 1) if act.any() else 0.0,
                                    "max_shift_ms": round(float(np.max(np.abs(shift))) * 1000, 1)}
