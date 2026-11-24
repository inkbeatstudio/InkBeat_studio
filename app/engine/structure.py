from __future__ import annotations

import numpy as np
import librosa

from .harmony import beat_sync

LABELS = {
    "intro": ("Intro", "Інтро"),
    "verse": ("Verse", "Куплет"),
    "prechorus": ("Pre-Chorus", "Пре-приспів"),
    "chorus": ("Chorus", "Приспів"),
    "bridge": ("Bridge", "Бридж"),
    "inst": ("Instrumental", "Програш"),
    "outro": ("Outro", "Аутро"),
}
COLORS = {"intro": "#6b7280", "verse": "#3b82f6", "prechorus": "#a855f7", "chorus": "#f43f5e",
          "bridge": "#f59e0b", "inst": "#14b8a6", "outro": "#6b7280"}


def _laplacian_labels(mix, sr, beats, k_range=(3, 7)):
    import scipy.ndimage
    import scipy.sparse.csgraph
    from sklearn.cluster import KMeans

    hop = 512
    bf = librosa.time_to_frames(beats, sr=sr, hop_length=hop)
    Cq = librosa.amplitude_to_db(np.abs(librosa.cqt(y=mix, sr=sr, hop_length=hop, bins_per_octave=36,
                                                    n_bins=7 * 36)), ref=np.max)
    Csync = beat_sync(Cq, bf, aggregate=np.median)
    R = librosa.segment.recurrence_matrix(Csync, width=3, mode="affinity", sym=True)
    Rf = librosa.segment.timelag_filter(scipy.ndimage.median_filter)(R, size=(1, 7))
    mfcc = librosa.feature.mfcc(y=mix, sr=sr, hop_length=hop, n_mfcc=13)
    Msync = beat_sync(mfcc, bf)
    path_distance = np.sum(np.diff(Msync, axis=1) ** 2, axis=0)
    sigma = np.median(path_distance) + 1e-9
    path_sim = np.exp(-path_distance / sigma)
    R_path = np.diag(path_sim, k=1) + np.diag(path_sim, k=-1)
    deg_path = np.sum(R_path, axis=1)
    deg_rec = np.sum(Rf, axis=1)
    mu = deg_path.dot(deg_path + deg_rec) / (np.sum((deg_path + deg_rec) ** 2) + 1e-9)
    A = mu * Rf + (1 - mu) * R_path
    Lap = scipy.sparse.csgraph.laplacian(A, normed=True)
    evals, evecs = np.linalg.eigh(Lap)
    evecs = scipy.ndimage.median_filter(evecs, size=(9, 1))
    Cnorm = np.cumsum(evecs ** 2, axis=1) ** 0.5
    lo, hi = k_range
    gaps = np.diff(evals[: hi + 1])
    k = int(np.clip(np.argmax(gaps[lo - 1: hi]) + lo, lo, hi))
    X = evecs[:, :k] / (Cnorm[:, k - 1: k] + 1e-9)
    return KMeans(n_clusters=k, n_init=10, random_state=0).fit_predict(X)


def segment(mix: np.ndarray, sr: int, beats: np.ndarray, downbeat_idx: int, beats_per_bar: int,
            vocal: np.ndarray | None = None) -> list[dict]:
    beats = np.asarray(beats)
    bar_starts = beats[downbeat_idx::beats_per_bar]
    n_bars = len(bar_starts)
    if n_bars < 8:
        return _finish([{"start_bar": 0, "end_bar": max(1, n_bars), "group": "A", "energy": 1.0, "vocal": 1.0}])
    labels = _laplacian_labels(mix, sr, beats)
    bar_lab = []
    for b in range(n_bars):
        i0 = downbeat_idx + b * beats_per_bar
        seg = labels[i0: i0 + beats_per_bar]
        bar_lab.append(int(np.bincount(seg).argmax()) if len(seg) else bar_lab[-1])
    bar_lab = np.array(bar_lab)
    runs = []
    for b, l in enumerate(bar_lab):
        if runs and runs[-1][2] == l:
            runs[-1][1] = b + 1
        else:
            runs.append([b, b + 1, l])
    changed = True
    while changed and len(runs) > 1:
        changed = False
        for i, r in enumerate(runs):
            if r[1] - r[0] < 2:
                j = i - 1 if i > 0 else i + 1
                if i > 0 and i + 1 < len(runs):
                    j = i - 1 if (runs[i - 1][1] - runs[i - 1][0]) >= (runs[i + 1][1] - runs[i + 1][0]) else i + 1
                a, b = min(runs[i][0], runs[j][0]), max(runs[i][1], runs[j][1])
                runs[j] = [a, b, runs[j][2]]
                runs.pop(i)
                k = 0
                while k < len(runs) - 1:
                    if runs[k][2] == runs[k + 1][2]:
                        runs[k][1] = runs[k + 1][1]
                        runs.pop(k + 1)
                    else:
                        k += 1
                changed = True
                break
    hop = 512
    frames = librosa.time_to_frames(bar_starts, sr=sr, hop_length=hop)
    R = beat_sync(librosa.feature.rms(y=mix, hop_length=hop), frames)[0]
    Rn = R / (np.percentile(R, 95) + 1e-9)
    if vocal is not None:
        V = beat_sync(librosa.feature.rms(y=vocal, hop_length=hop), frames)[0]
        V = V / (np.percentile(V, 95) + 1e-9)
    else:
        V = np.ones_like(Rn)
    runs = _tidy(runs, n_bars, V)
    letters: dict[int, str] = {}
    segs = []
    for a, b, l in runs:
        letters.setdefault(l, chr(65 + len(letters)))
        segs.append({"start_bar": int(a), "end_bar": int(b), "group": letters[l],
                     "energy": float(Rn[a:b].mean()), "vocal": float(V[a:b].mean())})
    return _finish(segs)


def _merge_equal(runs):
    out = []
    for r in runs:
        if r[1] <= r[0]:
            continue
        if out and out[-1][2] == r[2]:
            out[-1][1] = r[1]
        else:
            out.append(list(r))
    return out


def _tidy(runs, n_bars, V, voc_thr=0.25):
    for i in range(1, len(runs)):
        b = runs[i][0]
        q = int(round(b / 4) * 4)
        if abs(q - b) <= 1 and 0 < q < n_bars:
            runs[i - 1][1] = q
            runs[i][0] = q
    runs = _merge_equal(runs)
    voc = lambda r: float(V[r[0]:r[1]].mean()) >= voc_thr
    while len(runs) > 1 and not voc(runs[0]) and not voc(runs[1]):
        runs[1] = [runs[0][0], runs[1][1], runs[0][2]]
        runs.pop(0)
    while len(runs) > 1 and not voc(runs[-1]) and not voc(runs[-2]):
        runs[-2] = [runs[-2][0], runs[-1][1], runs[-2][2]]
        runs.pop()
    for _ in range(6):
        changed = False
        for i, r in enumerate(runs):
            if r[1] - r[0] >= 4:
                continue
            occ = [j for j, x in enumerate(runs) if x[2] == r[2]]
            nxt = {runs[j + 1][2] if j + 1 < len(runs) else None for j in occ}
            prv = {runs[j - 1][2] if j > 0 else None for j in occ}
            if len(nxt) == 1 and None not in nxt:
                g = nxt.pop()
                for j in occ:
                    runs[j][2] = g
                changed = True
            elif len(prv) == 1 and None not in prv:
                g = prv.pop()
                for j in occ:
                    runs[j][2] = g
                changed = True
            if changed:
                runs = _merge_equal(runs)
                break
        if not changed:
            break
    return runs


def _finish(segs):
    _name(segs)
    return segs


def _name(segs):
    voc_thr = 0.25
    vocal_groups: dict[str, list] = {}
    for s in segs:
        if s["vocal"] >= voc_thr:
            vocal_groups.setdefault(s["group"], []).append(s)
    chorus_g = None
    if vocal_groups:
        def gscore(item):
            g, lst = item
            return (min(len(lst), 3), np.mean([x["energy"] for x in lst]))
        rep = {g: l for g, l in vocal_groups.items() if len(l) >= 2}
        pool = rep if rep else vocal_groups
        chorus_g = max(pool.items(), key=lambda it: (np.mean([x["energy"] for x in it[1]]), len(it[1])))[0]
        if not rep and len(vocal_groups) > 1:
            chorus_g = max(vocal_groups.items(), key=gscore)[0]
    verse_g = None
    for s in segs:
        if s["vocal"] >= voc_thr and s["group"] != chorus_g:
            verse_g = s["group"]
            break
    seen_chorus = False
    for i, s in enumerate(segs):
        if s["vocal"] < voc_thr:
            if i == 0:
                s["kind"] = "intro"
            elif i == len(segs) - 1:
                s["kind"] = "outro"
            else:
                s["kind"] = "inst"
        elif s["group"] == chorus_g:
            s["kind"] = "chorus"
            seen_chorus = True
        elif s["group"] == verse_g:
            s["kind"] = "verse"
        else:
            nxt = segs[i + 1] if i + 1 < len(segs) else None
            if nxt is not None and nxt["group"] == chorus_g and (s["end_bar"] - s["start_bar"]) <= 8:
                s["kind"] = "prechorus"
            elif seen_chorus:
                s["kind"] = "bridge"
            else:
                s["kind"] = "verse"
    counts: dict[str, int] = {}
    totals: dict[str, int] = {}
    for s in segs:
        totals[s["kind"]] = totals.get(s["kind"], 0) + 1
    for s in segs:
        counts[s["kind"]] = counts.get(s["kind"], 0) + 1
        en, ua = LABELS[s["kind"]]
        suffix = f" {counts[s['kind']]}" if totals[s["kind"]] > 1 else ""
        s["name"] = en + suffix
        s["name_ua"] = ua + suffix
        s["color"] = COLORS[s["kind"]]
