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


def conductor(bpm: float, beats_per_bar: int, key: dict | None, markers: list[tuple[float, str]],
              title: str) -> mido.MidiTrack:
    tr = mido.MidiTrack()
    tr.append(mido.MetaMessage("track_name", name=_ascii(title), time=0))
    tr.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(bpm), time=0))
    denom = 8 if beats_per_bar == 6 else 4
    tr.append(mido.MetaMessage("time_signature", numerator=beats_per_bar, denominator=denom, time=0))
    if key:
        k = KEY_SIG.get((key["mode"], key["tonic"]))
        if k:
            tr.append(mido.MetaMessage("key_signature", key=k, time=0))
    last = 0
    for beat, name in sorted(markers):
        t = int(round(beat * PPQ))
        tr.append(mido.MetaMessage("marker", text=_ascii(name), time=max(0, t - last)))
        last = max(last, t)
    tr.append(mido.MetaMessage("end_of_track", time=0))
    return tr


def note_track(name: str, notes: list[tuple[float, float, int, int]], channel: int, program: int | None,
               end_beat: float | None = None) -> mido.MidiTrack:
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
    ev.sort(key=lambda e: (e[0], e[1]))
    last = 0
    for t, on, p, v in ev:
        msg = "note_on" if on else "note_off"
        tr.append(mido.Message(msg, note=p, velocity=v if on else 0, channel=channel, time=t - last))
        last = t
    tail = 0
    if end_beat is not None:
        tail = max(0, int(round(end_beat * PPQ)) - last)
    tr.append(mido.MetaMessage("end_of_track", time=tail))
    return tr


def write(path: Path, tracks: list[mido.MidiTrack]):
    mf = mido.MidiFile(type=1, ticks_per_beat=PPQ)
    mf.tracks.extend(tracks)
    path.parent.mkdir(parents=True, exist_ok=True)
    mf.save(str(path))
