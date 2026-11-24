from __future__ import annotations

import numpy as np

from .transcribe import Note

SCALES = {
    "major": [0, 2, 4, 5, 7, 9, 11],
    "minor": [0, 2, 3, 5, 7, 8, 10],
}


def strength(n: Note) -> float:
    return n.amp * (0.6 + min(n.end - n.start, 1.0))


def drop_weak(notes: list[Note], min_dur: float, min_amp: float = 0.0) -> list[Note]:
    return [n for n in notes if (n.end - n.start) >= min_dur and n.amp >= min_amp]


def monophonize(notes: list[Note], min_dur: float, prefer_low: bool = False) -> list[Note]:
    notes = sorted(notes, key=lambda n: (n.start, -strength(n)))
    out: list[Note] = []
    for n in notes:
        n = Note(n.start, n.end, n.pitch, n.amp, n.bend)
        if not out or n.start >= out[-1].end - 0.015:
            if out and n.start < out[-1].end:
                out[-1].end = n.start
            out.append(n)
            continue
        last = out[-1]
        s_last, s_new = strength(last), strength(n)
        if prefer_low and abs(n.start - last.start) < 0.05:
            if n.pitch < last.pitch and s_new > 0.5 * s_last:
                out[-1] = n
            continue
        if s_new >= s_last * 0.8:
            last.end = n.start
            if last.end - last.start < min_dur:
                out.pop()
            out.append(n)
        elif n.end > last.end + min_dur:
            n.start = last.end
            out.append(n)
    return [n for n in out if n.end - n.start >= min_dur * 0.75]


def fix_octave_blips(notes: list[Note], max_dur: float = 0.12) -> list[Note]:
    for i in range(1, len(notes) - 1):
        a, n, b = notes[i - 1], notes[i], notes[i + 1]
        if n.end - n.start > max_dur:
            continue
        for shift in (12, -12):
            p = n.pitch - shift
            if abs(p - a.pitch) <= 2 and abs(p - b.pitch) <= 2 and abs(n.pitch - a.pitch) >= 10:
                n.pitch = p
                break
    return notes


def remove_harmonic_ghosts(notes: list[Note], ratio: float = 0.65) -> list[Note]:
    HARM = (12, 19, 24, 28, 31, 36)
    notes = sorted(notes, key=lambda n: n.start)
    keep = []
    for n in notes:
        ghost = False
        for m in notes:
            if m.start > n.start + 0.06:
                break
            if m is n or (n.pitch - m.pitch) not in HARM or m.end < n.start + 0.05:
                continue
            same_onset = abs(m.start - n.start) <= 0.06
            r = ratio if same_onset else ratio * 0.92
            if n.amp < m.amp * r:
                ghost = True
                break
        if not ghost:
            keep.append(n)
    return keep


def refine_onsets(notes: list[Note], onset_times: np.ndarray, early: float = 0.09, late: float = 0.03) -> list[Note]:
    if onset_times is None or len(onset_times) == 0:
        return notes
    for n in notes:
        j = np.searchsorted(onset_times, n.start)
        best = None
        for c in (j - 1, j):
            if 0 <= c < len(onset_times):
                d = onset_times[c] - n.start
                if -early <= d <= late and (best is None or abs(d) < abs(best)):
                    best = d
        if best is not None:
            n.start = max(0.0, n.start + best)
    return notes


def merge_unarticulated(notes: list[Note], onset_times: np.ndarray | None, tol: float = 0.04) -> list[Note]:
    if onset_times is None or len(onset_times) == 0 or not notes:
        return notes
    out = [notes[0]]
    for n in notes[1:]:
        last = out[-1]
        if n.pitch == last.pitch and n.start - last.end < 0.03:
            j = np.searchsorted(onset_times, n.start)
            near = any(0 <= c < len(onset_times) and abs(onset_times[c] - n.start) <= tol for c in (j - 1, j))
            if not near:
                last.end = max(last.end, n.end)
                continue
        out.append(n)
    return out


def loudness_gate(notes: list[Note], rms: np.ndarray, fps: float, gate_db: float) -> list[Note]:
    if rms is None or len(rms) == 0:
        return notes
    ref = np.percentile(rms, 95) + 1e-9
    thr = ref * 10 ** (gate_db / 20)
    out = []
    for n in notes:
        a = int(n.start * fps)
        b = max(a + 1, int(min(n.end, n.start + 0.15) * fps))
        if rms[a:b].size and rms[a:b].max() >= thr:
            out.append(n)
    return out


def limit_polyphony(notes: list[Note], max_voices: int) -> list[Note]:
    if max_voices <= 0:
        return notes
    notes = sorted(notes, key=lambda n: n.start)
    keep = []
    for n in sorted(notes, key=lambda n: -strength(n)):
        overlapping = [k for k in keep if k.start < n.end and n.start < k.end]
        sim = sum(1 for k in overlapping if k.start <= n.start + 0.03 and k.end > n.start)
        if sim < max_voices:
            keep.append(n)
    return sorted(keep, key=lambda n: (n.start, n.pitch))


def remove_duplicates(notes: list[Note]) -> list[Note]:
    by_pitch: dict[int, list[Note]] = {}
    for n in sorted(notes, key=lambda n: n.start):
        lst = by_pitch.setdefault(n.pitch, [])
        if lst and n.start < lst[-1].end - 0.01:
            lst[-1].end = max(lst[-1].end, n.end)
            lst[-1].amp = max(lst[-1].amp, n.amp)
        else:
            lst.append(n)
    out = [n for lst in by_pitch.values() for n in lst]
    return sorted(out, key=lambda n: (n.start, n.pitch))


def scale_pcs(tonic_pc: int, mode: str) -> set[int]:
    return {(tonic_pc + i) % 12 for i in SCALES.get(mode, SCALES["major"])}


def snap_to_scale(pitch: int, pcs: set[int], prefer_down: bool = False) -> int:
    if pitch % 12 in pcs:
        return pitch
    up, down = pitch + 1, pitch - 1
    if prefer_down:
        return down if down % 12 in pcs else up
    return up if up % 12 in pcs else down


def quantize_beats(x: float, grid: float, strength_: float) -> float:
    if grid <= 0 or strength_ <= 0:
        return x
    q = round(x / grid) * grid
    return x + (q - x) * strength_


def velocity(amp: float, mode: str = "dynamic", lo: int = 45, hi: int = 120, fixed: int = 100) -> int:
    if mode == "fixed":
        return fixed
    v = lo + (hi - lo) * float(np.clip((amp - 0.15) / 0.65, 0, 1)) ** 0.8
    return int(np.clip(round(v), 1, 127))


def process_track(notes: list[Note], role: str, mono: bool, min_dur: float, max_voices: int,
                  onset_times: np.ndarray | None = None) -> list[Note]:
    notes = [Note(n.start, n.end, n.pitch, n.amp, n.bend) for n in notes]
    notes = remove_duplicates(drop_weak(notes, min_dur * 0.75, 0.12))
    notes = refine_onsets(notes, onset_times)
    notes = remove_harmonic_ghosts(notes)
    if mono:
        notes = monophonize(notes, min_dur, prefer_low=(role == "bass"))
        notes = fix_octave_blips(notes)
        notes = merge_unarticulated(notes, onset_times)
    else:
        notes = limit_polyphony(notes, max_voices)
    return notes
