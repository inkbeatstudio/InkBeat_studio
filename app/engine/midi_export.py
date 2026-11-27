from __future__ import annotations

from pathlib import Path

import mido

PPQ = 960

KEY_SIG = {
    ("major", 0): "C", ("major", 1): "Db", ("major", 2): "D", ("major", 3): "Eb", ("major", 4): "E",
    ("major", 5): "F", ("major", 6): "F#", ("major", 7): "G", ("major", 8): "Ab", ("major", 9): "A",
    ("major", 10): "Bb", ("major", 11): "B",
    ("minor", 0): "Cm", ("minor", 1): "C#m", ("minor", 2): "Dm", ("minor", 3): "Ebm", ("minor", 4): "Em",
    ("minor", 5): "Fm", ("minor", 6): "F#m", ("minor", 7): "Gm", ("minor", 8): "G#m", ("minor", 9): "Am",
    ("minor", 10): "Bbm", ("minor", 11): "Bm",
}


def _ascii(s: str) -> str:
    return s.encode("latin-1", "replace").decode("latin-1")


def tempo_segs(base: float, tempo: list | None) -> list[tuple[float, float, float]]:
    segs = [(0.0, 0.0, float(base))]
    for u, bpm in sorted((float(a), float(b)) for a, b in (tempo or []) if 20 <= float(b) <= 400):
        if u <= 1e-9:
            segs[0] = (0.0, 0.0, bpm)
            continue
        pu, pm, pb = segs[-1]
        segs.append((u, pm + (u - pu) * pb / base, bpm))
    return segs


def to_musical(segs: list, base: float, u: float) -> float:
    s = segs[0]
    for x in segs:
        if x[0] <= u:
            s = x
        else:
            break
    return s[1] + (u - s[0]) * s[2] / base


def remap_lyrics(lyr, segs, base):
    return [[to_musical(segs, base, float(b)), t] for b, t in lyr or []]


def remap_notes(notes, cc, end_beat, segs, base):
    f = lambda u: to_musical(segs, base, u)
    out = [(f(n[0]), max(1e-3, f(n[0] + n[1]) - f(n[0])), n[2], n[3]) for n in notes]
    cc2 = {k: [[f(e[0])] + list(e[1:]) for e in v] for k, v in cc.items()} if cc else cc
    return out, cc2, (f(end_beat) if end_beat is not None else None)


def conductor(bpm: float, beats_per_bar: int, key: dict | None, markers: list[tuple[float, str]],
              title: str, tempos: list[tuple[float, float]] | None = None) -> mido.MidiTrack:
    tr = mido.MidiTrack()
    tr.append(mido.MetaMessage("track_name", name=_ascii(title), time=0))
    tr.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(bpm), time=0))
    denom = 8 if beats_per_bar == 6 else 4
    tr.append(mido.MetaMessage("time_signature", numerator=beats_per_bar, denominator=denom, time=0))
    if key:
        k = KEY_SIG.get((key["mode"], key["tonic"]))
        if k:
            tr.append(mido.MetaMessage("key_signature", key=k, time=0))
    ev = [(int(round(beat * PPQ)), 1, mido.MetaMessage("marker", text=_ascii(name))) for beat, name in markers]
    for m, b in tempos or []:
        t = int(round(m * PPQ))
        if t <= 0:
            tr[1] = mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(b), time=0)
        else:
            ev.append((t, 0, mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(b))))
    last = 0
    for t, _, msg in sorted(ev, key=lambda e: (e[0], e[1])):
        msg.time = max(0, t - last)
        tr.append(msg)
        last = max(last, t)
    tr.append(mido.MetaMessage("end_of_track", time=0))
    return tr


def note_track(name: str, notes: list[tuple[float, float, int, int]], channel: int, program: int | None,
               end_beat: float | None = None, cc: dict | None = None, lyrics: list | None = None) -> mido.MidiTrack:
    tr = mido.MidiTrack()
    tr.append(mido.MetaMessage("track_name", name=_ascii(name), time=0))
    if program is not None and channel != 9:
        tr.append(mido.Message("program_change", program=int(program) & 127, channel=channel, time=0))
    ev = []
    for s, l, p, v in notes:
        a = int(round(s * PPQ))
        b = max(a + 1, int(round((s + l) * PPQ)))
        p = int(min(127, max(0, p)))
        ev.append((a, 1, p, int(min(127, max(1, v)))))
        ev.append((b, 0, p, 0))
    for k, pts in (cc or {}).items():
        for bt, val in pts or []:
            t = max(0, int(round(float(bt) * PPQ)))
            if k == "pb":
                ev.append((t, -1, "pb", int(max(-8192, min(8191, round(float(val) * 8191))))))
            elif str(k).isdigit():
                ev.append((t, -1, int(k), int(max(0, min(127, round(float(val) * 127))))))
    for bt, txt in lyrics or []:
        ev.append((max(0, int(round(float(bt) * PPQ))), 0.5, "lyr", str(txt)[:40]))
    ev.sort(key=lambda e: (e[0], e[1]))
    last = 0
    for t, on, p, v in ev:
        if on == 0.5:
            tr.append(mido.MetaMessage("lyrics", text=v, time=t - last))
        elif on == -1:
            if p == "pb":
                tr.append(mido.Message("pitchwheel", pitch=v, channel=channel, time=t - last))
            else:
                tr.append(mido.Message("control_change", control=p, value=v, channel=channel, time=t - last))
        else:
            msg = "note_on" if on else "note_off"
            tr.append(mido.Message(msg, note=p, velocity=v if on else 0, channel=channel, time=t - last))
        last = t
    tail = 0
    if end_beat is not None:
        tail = max(0, int(round(end_beat * PPQ)) - last)
    tr.append(mido.MetaMessage("end_of_track", time=tail))
    return tr


def write(path: Path, tracks: list[mido.MidiTrack]):
    mf = mido.MidiFile(type=1, ticks_per_beat=PPQ, charset="utf-8")
    mf.tracks.extend(tracks)
    path.parent.mkdir(parents=True, exist_ok=True)
    mf.save(str(path))
