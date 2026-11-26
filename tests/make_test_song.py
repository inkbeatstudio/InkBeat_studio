import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

SR = 44100
BPM = 112.0
BEAT = 60.0 / BPM
LEAD_IN = 0.37
rng = np.random.default_rng(7)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def env(n, a=0.005, d=0.3, sustain=0.0, rel=0.05, length=None):
    t = np.arange(n) / SR
    e = np.minimum(1, t / a) * (sustain + (1 - sustain) * np.exp(-t / d))
    r = int(rel * SR)
    if r and n > r:
        e[-r:] *= np.linspace(1, 0, r)
    return e


def add(buf, sig, t0):
    i = int(round(t0 * SR))
    j = min(len(buf), i + len(sig))
    if j > i:
        buf[i:j] += sig[: j - i]


def kick(v):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 45 + 90 * np.exp(-t / 0.03)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return v * np.sin(ph) * np.exp(-t / 0.12)


def snare(v):
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    noise = sosfilt(butter(2, [1500, 7000], "bandpass", fs=SR, output="sos"), rng.standard_normal(n))
    tone = np.sin(2 * np.pi * 190 * t)
    return v * (0.7 * noise * np.exp(-t / 0.07) + 0.5 * tone * np.exp(-t / 0.04))


def hat(v, open_=False):
    n = int((0.4 if open_ else 0.08) * SR)
    t = np.arange(n) / SR
    noise = sosfilt(butter(4, 8000, "highpass", fs=SR, output="sos"), rng.standard_normal(n))
    return v * 0.35 * noise * np.exp(-t / (0.18 if open_ else 0.02))


def bass_note(m, dur, v):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(m)
    saw = 2 * ((t * f) % 1) - 1
    sig = sosfilt(butter(2, 600, "lowpass", fs=SR, output="sos"), saw)
    return v * 0.6 * sig * env(n, 0.004, 0.6, 0.5, 0.03)


def keys_note(m, dur, v):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(m)
    sig = sum((0.6 ** k) * np.sin(2 * np.pi * f * (k + 1) * t) for k in range(6))
    return v * 0.25 * sig * env(n, 0.003, 0.9, 0.15, 0.06)


def voice_note(m, dur, v):
    n = int(dur * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * np.minimum(1, t / 0.3)
    ph = 2 * np.pi * np.cumsum(hz(m) * vib) / SR
    sig = sum((0.5 ** k) * np.sin((k + 1) * ph) for k in range(8))
    sig = sosfilt(butter(2, [300, 3500], "bandpass", fs=SR, output="sos"), sig)
    return v * 0.5 * sig * env(n, 0.04, 2.0, 0.8, 0.06)


def main(out_dir):
    out = Path(out_dir)
    (out / "stems").mkdir(parents=True, exist_ok=True)
    bars = 40
    total = LEAD_IN + bars * 4 * BEAT + 2.0
    N = int(total * SR)
    stems = {k: np.zeros(N) for k in ["drums", "bass", "piano", "vocals"]}
    truth = {k: [] for k in stems}


    verse = [(57, "Am"), (53, "F"), (48, "C"), (55, "G")]
    chorus = [(53, "F"), (55, "G"), (52, "Em"), (57, "Am")]
    triads = {"Am": [57, 60, 64], "F": [53, 57, 60], "C": [48, 52, 55], "G": [55, 59, 62], "Em": [52, 55, 59]}
    sections = [("Intro", 0, 4), ("Verse", 4, 12), ("Chorus", 12, 20), ("Verse", 20, 28), ("Chorus", 28, 36),
                ("Outro", 36, 40)]
    verse_mel = [69, 67, 64, 67, 69, 72, 71, 69]
    chorus_mel = [72, 74, 76, 74, 72, 71, 69, 67]
    chords_truth = []

    for bar in range(bars):
        sec = next(s for s in sections if s[1] <= bar < s[2])[0]
        t_bar = LEAD_IN + bar * 4 * BEAT
        prog = chorus if sec == "Chorus" else verse
        root, name = prog[bar % 4]
        chords_truth.append([t_bar, name])
        loud = 1.0 if sec == "Chorus" else 0.8

        hits = [(b * 0.5, 0.45) for b in range(8)] if sec == "Chorus" else [(0, 1.9), (2, 1.9)]
        for b, dl in hits:
            for m in triads[name]:
                add(stems["piano"], keys_note(m + 12, dl * BEAT, 0.7 * loud), t_bar + b * BEAT)
                truth["piano"].append([t_bar + b * BEAT, t_bar + (b + dl) * BEAT, m + 12])
        if sec in ("Intro", "Outro"):
            for e in range(8):
                add(stems["drums"], hat(0.5), t_bar + e * BEAT / 2)
                truth["drums"].append([t_bar + e * BEAT / 2, 42])
            continue

        for b in range(4):
            tb = t_bar + b * BEAT
            if b in (0, 2) or (sec == "Chorus" and b == 3):
                off = 0 if b != 3 else BEAT / 2
                add(stems["drums"], kick(0.9 * loud), tb + off)
                truth["drums"].append([tb + off, 36])
            if b in (1, 3):
                add(stems["drums"], snare(0.8 * loud), tb)
                truth["drums"].append([tb, 38])
            for e in range(2):
                op = sec == "Chorus" and b == 3 and e == 1
                add(stems["drums"], hat(0.5 * loud, op), tb + e * BEAT / 2)
                truth["drums"].append([tb + e * BEAT / 2, 46 if op else 42])

        for e in range(8):
            m = root - 24 + (12 if e == 7 else 0)
            if m < 28:
                m += 12
            st = t_bar + e * BEAT / 2
            add(stems["bass"], bass_note(m, BEAT / 2 * 0.9, 0.9), st)
            truth["bass"].append([st, st + BEAT / 2 * 0.9, m])

        mel = chorus_mel if sec == "Chorus" else verse_mel
        for b in range(4):
            if bar % 2 == 1 and b == 3:
                continue
            m = mel[(bar % 2) * 4 + b]
            st = t_bar + b * BEAT
            d = BEAT * (1.9 if (bar % 2 == 1 and b == 2) else 0.92)
            add(stems["vocals"], voice_note(m, d, 0.8 * loud), st)
            truth["vocals"].append([st, st + d, m])

    mix = sum(stems.values())
    peak = np.max(np.abs(mix)) / 0.9
    for k, v in stems.items():
        sf.write(out / "stems" / f"{k.capitalize()}.wav", np.stack([v, v], 1) / peak, SR, subtype="PCM_16")
    sf.write(out / "mix.wav", np.stack([mix, mix], 1) / peak, SR, subtype="PCM_16")
    json.dump({"bpm": BPM, "lead_in": LEAD_IN, "key": "A minor", "notes": truth,
               "chords": chords_truth, "sections": sections}, open(out / "truth.json", "w"), indent=1)
    print("wrote", out, f"{total:.1f}s")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "test_song")
