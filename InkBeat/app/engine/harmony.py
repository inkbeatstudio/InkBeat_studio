from __future__ import annotations

import numpy as np
import librosa

NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
NOTE_NAMES_UA = NOTE_NAMES

KK_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KK_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

CHORD_TYPES = {
    "": [0, 4, 7],
    "m": [0, 3, 7],
    "7": [0, 4, 7, 10],
    "maj7": [0, 4, 7, 11],
    "m7": [0, 3, 7, 10],
    "sus4": [0, 5, 7],
    "sus2": [0, 2, 7],
    "dim": [0, 3, 6],
}
TYPE_PRIOR = {"": 1.0, "m": 1.0, "7": 0.86, "maj7": 0.85, "m7": 0.86, "sus4": 0.84, "sus2": 0.82, "dim": 0.8}


def chroma_of(y: np.ndarray, sr: int, hop: int = 512) -> np.ndarray:
    y = librosa.effects.harmonic(y, margin=2.0) if len(y) > sr else y
    return librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop, bins_per_octave=36)


def detect_key(chroma: np.ndarray) -> dict:
    prof = chroma.sum(axis=1)
    if prof.sum() <= 0:
        return {"tonic": 0, "mode": "major", "name": "C major", "confidence": 0.0}
    prof = (prof - prof.mean()) / (prof.std() + 1e-9)
    results = []
    for mode, kp in (("major", KK_MAJOR), ("minor", KK_MINOR)):
        kp = (kp - kp.mean()) / kp.std()
        for t in range(12):
            r = float(np.corrcoef(prof, np.roll(kp, t))[0, 1])
            results.append((r, t, mode))
    results.sort(reverse=True)
    r, t, mode = results[0]
    second = results[1][0]
    return {"tonic": t, "mode": mode, "name": f"{NOTE_NAMES[t]} {mode}",
            "confidence": float(np.clip((r - second) * 5 + r * 0.5, 0, 1)),
            "alternatives": [f"{NOTE_NAMES[x[1]]} {x[2]}" for x in results[1:3]]}


def beat_sync(feat: np.ndarray, beat_frames: np.ndarray, aggregate=np.mean) -> np.ndarray:
    n = feat.shape[1]
    bf = np.clip(np.asarray(beat_frames, dtype=int), 0, n - 1)
    idx = np.unique(np.concatenate([bf, [n]]))
    out = librosa.util.sync(feat, idx, aggregate=aggregate, pad=False)
    if out.shape[1] < len(beat_frames):
        out = np.pad(out, ((0, 0), (0, len(beat_frames) - out.shape[1])), mode="edge")
    return out[:, : len(beat_frames)]


def refine_key_with_chords(key: dict, segs: list[dict]) -> dict:
    if not segs:
        return key
    t = key["tonic"]
    if key["mode"] == "major":
        alt_t, alt_mode, maj_t, min_t = (t + 9) % 12, "minor", t, (t + 9) % 12
    else:
        alt_t, alt_mode, maj_t, min_t = (t + 3) % 12, "major", (t + 3) % 12, t
    dur = {"maj": 0.0, "min": 0.0}
    real = [s for s in segs if s["label"] != "N"]
    for s in real:
        d = s["end_beat"] - s["start_beat"]
        if s["root"] == maj_t and s["kind"] in ("", "maj7", "sus2", "sus4"):
            dur["maj"] += d
        if s["root"] == min_t and s["kind"] in ("m", "m7"):
            dur["min"] += d
    total = sum(s["end_beat"] - s["start_beat"] for s in real) + 1e-9
    score_min = dur["min"] / total - dur["maj"] / total
    for s, w in ((real[0], 0.06), (real[-1], 0.04)) if real else ():
        if s["root"] == min_t and s["kind"] in ("m", "m7"):
            score_min += w
        if s["root"] == maj_t and s["kind"] in ("", "maj7"):
            score_min -= w
    want_minor = score_min > 0
    if want_minor == (key["mode"] == "minor"):
        return key
    new = dict(key)
    new.update(tonic=alt_t, mode=alt_mode, name=f"{NOTE_NAMES[alt_t]} {alt_mode}",
               alternatives=[key["name"]] + [a for a in key.get("alternatives", []) if a != new["name"]
                                             and a != f"{NOTE_NAMES[alt_t]} {alt_mode}"][:1])
    return new


def _templates():
    labels, mats, roots, kinds = [], [], [], []
    for root in range(12):
        for kind, ivs in CHORD_TYPES.items():
            v = np.zeros(12)
            for k, i in enumerate(ivs):
                v[(root + i) % 12] = 1.0 if k < 3 else 0.6
            v[root] += 0.3
            mats.append(v / np.linalg.norm(v))
            labels.append(NOTE_NAMES[root] + kind)
            roots.append(root)
            kinds.append(kind)
    return labels, np.array(mats), roots, kinds


def detect_chords(harm_chroma: np.ndarray, bass_chroma: np.ndarray | None, beat_frames: np.ndarray,
                  key: dict | None = None, self_bias: float = 0.35) -> list[dict]:
    labels, T, roots, kinds = _templates()
    n_beats = len(beat_frames)
    if n_beats < 2:
        return []
    sync = beat_sync(harm_chroma, beat_frames)
    energy = sync.sum(axis=0)
    sync_n = sync / (np.linalg.norm(sync, axis=0, keepdims=True) + 1e-9)
    emis = T @ sync_n
    prior = np.array([TYPE_PRIOR[k] for k in kinds])[:, None]
    emis = emis * prior
    if bass_chroma is not None:
        bsync = beat_sync(bass_chroma, beat_frames)
        bsync = bsync / (bsync.max(axis=0, keepdims=True) + 1e-9)
        root_support = bsync[np.array(roots)]
        emis = emis + 0.25 * root_support
    if key is not None:
        pcs = {(key["tonic"] + i) % 12 for i in ([0, 2, 4, 5, 7, 9, 11] if key["mode"] == "major"
                                                 else [0, 2, 3, 5, 7, 8, 10])}
        diatonic = np.array([all(((r + i) % 12) in pcs for i in CHORD_TYPES[k][:3])
                             for r, k in zip(roots, kinds)], dtype=float)
        emis = emis + 0.06 * diatonic[:, None]
    L = len(labels)
    logp = np.log(np.clip(emis, 1e-4, None)) * 6.0
    trans = np.full((L, L), -self_bias * 6.0)
    np.fill_diagonal(trans, 0.0)
    dp = logp[:, 0].copy()
    back = np.zeros((L, n_beats), dtype=int)
    for t in range(1, n_beats):
        cand = dp[:, None] + trans
        back[:, t] = np.argmax(cand, axis=0)
        dp = cand[back[:, t], np.arange(L)] + logp[:, t]
    path = np.zeros(n_beats, dtype=int)
    path[-1] = int(np.argmax(dp))
    for t in range(n_beats - 1, 0, -1):
        path[t - 1] = back[path[t], t]
    silent = energy < (np.percentile(energy, 90) * 0.04 + 1e-9)
    segs = []
    for b in range(n_beats):
        lab = "N" if silent[b] else labels[path[b]]
        if segs and segs[-1]["label"] == lab:
            segs[-1]["end_beat"] = b + 1
        else:
            r = roots[path[b]]
            segs.append({"start_beat": b, "end_beat": b + 1, "label": lab,
                         "root": None if lab == "N" else r,
                         "kind": None if lab == "N" else kinds[path[b]]})
    return segs


def chord_voicing(root: int, kind: str, center: int = 60) -> list[int]:
    ivs = CHORD_TYPES.get(kind, [0, 4, 7])
    base = center - 6 + ((root - (center - 6)) % 12)
    notes = sorted(base + i for i in ivs)
    while notes[-1] > center + 12:
        notes = notes[:-1] + [notes[-1] - 12]
        notes.sort()
    return notes
