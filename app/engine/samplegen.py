from __future__ import annotations

import numpy as np

SR = 44100


def _t(dur):
    return np.arange(int(dur * SR)) / SR


def _env(dur, decay, attack=0.001):
    t = _t(dur)
    e = np.exp(-t / max(1e-4, decay))
    if attack > 0:
        a = int(attack * SR)
        if a > 1:
            e[:a] *= np.linspace(0, 1, a)
    return e


def _sweep(f0, f1, tau, dur):
    t = _t(dur)
    f = f1 + (f0 - f1) * np.exp(-t / tau)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def _bp(x, lo, hi, order=2):
    from scipy.signal import butter, sosfilt

    lo = max(20.0, lo)
    hi = min(SR / 2 - 100, hi)
    return sosfilt(butter(order, [lo, hi], btype="band", fs=SR, output="sos"), x)


def _hp(x, f, order=2):
    from scipy.signal import butter, sosfilt

    return sosfilt(butter(order, f, btype="high", fs=SR, output="sos"), x)


def _lp(x, f, order=2):
    from scipy.signal import butter, sosfilt

    return sosfilt(butter(order, min(f, SR / 2 - 100), btype="low", fs=SR, output="sos"), x)


def _noise(dur, rng):
    return rng.uniform(-1, 1, int(dur * SR))


def _norm(x, peak=0.89):
    m = float(np.max(np.abs(x))) if x.size else 0
    return x * (peak / m) if m > 0 else x


def _fade(x, ms=4):
    n = min(len(x) // 3, int(ms / 1000 * SR))
    if n > 1:
        x[-n:] *= np.linspace(1, 0, n)
    return x


def _osc(kind, f, dur, phase=0.0):
    t = _t(dur)
    ph = (f * t + phase) % 1.0
    if kind == "sine":
        return np.sin(2 * np.pi * ph)
    if kind == "square":
        return np.where(ph < 0.5, 1.0, -1.0)
    if kind == "tri":
        return 4 * np.abs(ph - 0.5) - 1
    return 2 * ph - 1


def kick(rng, f0=160, f1=48, tau=0.045, decay=0.32, click=0.5, drive=1.4, dur=0.6):
    body = _sweep(f0, f1, tau, dur) * _env(dur, decay)
    c = _hp(_noise(0.012, rng), 1500) * click
    body[: len(c)] += c * np.linspace(1, 0, len(c))
    return _fade(_norm(np.tanh(body * drive)))


def snare(rng, tone=190, noise_decay=0.16, tone_decay=0.08, lo=1200, hi=9000, mix=0.65, dur=0.45):
    t = _t(dur)
    body = (np.sin(2 * np.pi * tone * t) + 0.5 * np.sin(2 * np.pi * tone * 1.6 * t)) * _env(dur, tone_decay)
    nz = _bp(_noise(dur, rng), lo, hi) * _env(dur, noise_decay)
    return _fade(_norm(body * (1 - mix) + nz * mix * 2.2))


def clap(rng, decay=0.18, lo=900, hi=5000, bursts=4, dur=0.5):
    x = np.zeros(int(dur * SR))
    for k in range(bursts):
        s = int((k * 0.011) * SR)
        b = _bp(_noise(0.02, rng), lo, hi) * np.linspace(1, 0, int(0.02 * SR))
        x[s:s + len(b)] += b
    tail = _bp(_noise(dur, rng), lo, hi) * _env(dur, decay) * 0.6
    s = int(bursts * 0.011 * SR)
    x[s:] += tail[: len(x) - s]
    return _fade(_norm(x))


METAL = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0]


def hat(rng, decay=0.05, hp=7000, tone=1.0, dur=0.3, noise=0.4):
    x = sum(_osc("square", f * tone * 1.47, dur) for f in METAL) / 6
    x = _hp(x + _noise(dur, rng) * noise, hp, 3) * _env(dur, decay)
    return _fade(_norm(x))


def cymbal(rng, decay=1.2, hp=5000, dur=2.5, tone=1.0):
    x = sum(_osc("square", f * tone * 2.1, dur) for f in METAL) / 6 + _noise(dur, rng) * 0.8
    return _fade(_norm(_hp(x, hp, 2) * _env(dur, decay, 0.002)), 40)


def tom(rng, f=140, decay=0.3, dur=0.7):
    x = _sweep(f * 1.6, f, 0.04, dur) * _env(dur, decay)
    x[: int(0.01 * SR)] += _hp(_noise(0.01, rng), 2000) * 0.3
    return _fade(_norm(np.tanh(x * 1.2)))


def perc(rng, kind):
    if kind == "rim":
        x = (np.sin(2 * np.pi * 1700 * _t(0.08)) * _env(0.08, 0.012) + _bp(_noise(0.08, rng), 2000, 7000) * _env(0.08, 0.006))
    elif kind == "cowbell":
        d = 0.5
        x = _bp(_osc("square", 540, d) + _osc("square", 800, d), 400, 3000) * _env(d, 0.12)
    elif kind == "shaker":
        x = _bp(_noise(0.18, rng), 5000, 12000) * (np.sin(np.pi * np.linspace(0, 1, int(0.18 * SR))) ** 2)
    elif kind == "tamb":
        x = _hp(sum(_osc("square", f * 3.3, 0.35) for f in METAL[:4]) + _noise(0.35, rng), 6000) * _env(0.35, 0.09)
    elif kind == "conga_hi":
        x = _sweep(420, 330, 0.02, 0.4) * _env(0.4, 0.12)
    elif kind == "conga_lo":
        x = _sweep(290, 210, 0.025, 0.5) * _env(0.5, 0.16)
    elif kind == "woodblock":
        x = np.sin(2 * np.pi * 1150 * _t(0.15)) * _env(0.15, 0.025) + _bp(_noise(0.15, rng), 800, 2000) * _env(0.15, 0.01) * 0.4
    elif kind == "clave":
        x = np.sin(2 * np.pi * 2500 * _t(0.12)) * _env(0.12, 0.03)
    elif kind == "snap":
        x = _bp(_noise(0.2, rng), 1500, 6000) * _env(0.2, 0.03)
    elif kind == "bongo":
        x = _sweep(520, 400, 0.015, 0.3) * _env(0.3, 0.08)
    elif kind == "triangle":
        x = (np.sin(2 * np.pi * 4200 * _t(1.6)) + 0.5 * np.sin(2 * np.pi * 6100 * _t(1.6))) * _env(1.6, 0.5, 0.001)
    else:
        x = _bp(_noise(0.25, rng), 300, 1500) * _env(0.25, 0.05)
    return _fade(_norm(x))


def bass808(rng, decay=1.0, f=65.41, drop=2.0, drive=1.6, dur=1.8, glide=0.0):
    t = _t(dur)
    fr = f * (1 + (drop - 1) * np.exp(-t / 0.03))
    if glide:
        fr *= 2 ** (glide * np.clip((t - 0.25) / 0.35, 0, 1) / 12)
    x = np.sin(2 * np.pi * np.cumsum(fr) / SR) * _env(dur, decay, 0.002)
    x = np.tanh(x * drive) / np.tanh(drive)
    x[: int(0.006 * SR)] += _hp(_noise(0.006, rng), 1000) * 0.2
    return _fade(_norm(x), 30)


def reese(rng, f=65.41, dur=1.6):
    x = _osc("saw", f * 0.995, dur) + _osc("saw", f * 1.005, dur, 0.3) + 0.6 * np.sin(2 * np.pi * f / 2 * _t(dur))
    x = _lp(x, 900, 2) * _env(dur, 1.5, 0.01)
    return _fade(_norm(np.tanh(x * 1.3)), 40)


def riser(rng, dur=4.0, kind="noise"):
    t = _t(dur)
    prog = t / dur
    if kind == "noise":
        x = _noise(dur, rng)
        out = np.zeros_like(x)
        seg = int(0.05 * SR)
        for s in range(0, len(x), seg):
            c = 300 * (40 ** prog[s])
            out[s:s + seg] = _bp(x[s:s + seg + 512], c * 0.7, c * 1.4, 1)[:len(out[s:s + seg])]
        x = out
    else:
        f = 110 * (2 ** (prog * 3))
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.4 * _osc("saw", 220, dur) * prog
    x *= prog ** 1.5
    return _fade(_norm(x), 20)


def impact(rng, dur=3.0):
    t = _t(dur)
    boom = _sweep(90, 32, 0.15, dur) * _env(dur, 0.9)
    nz = _lp(_noise(dur, rng), 3000) * _env(dur, 0.35)
    return _fade(_norm(np.tanh((boom * 1.4 + nz * 0.6) * 1.5)), 60)


def whoosh(rng, dur=1.6):
    x = _noise(dur, rng)
    out = np.zeros_like(x)
    seg = int(0.03 * SR)
    for s in range(0, len(x), seg):
        p = s / len(x)
        c = 400 + 5000 * np.sin(np.pi * p)
        out[s:s + seg] = _bp(x[s:s + seg + 256], c * 0.6, c * 1.6, 1)[: len(out[s:s + seg])]
    env = np.sin(np.pi * np.linspace(0, 1, len(out))) ** 2
    return _fade(_norm(out * env), 20)


def vinyl(rng, dur=4.0):
    x = _lp(_noise(dur, rng), 3000) * 0.05
    pops = rng.random(len(x)) < 0.0006
    x[pops] += rng.uniform(-0.9, 0.9, int(pops.sum()))
    return _norm(_hp(x, 200), 0.5)


def chord_stab(rng, root=60, minor=False, dur=0.9, bright=2400):
    iv = [0, 3, 7, 12] if minor else [0, 4, 7, 12]
    x = sum(_osc("saw", 440 * 2 ** ((root + i - 69) / 12) * (1 + 0.003 * k), dur, k * 0.21) for k, i in enumerate(iv)) / 4
    t = _t(dur)
    from scipy.signal import butter, sosfilt

    out = np.zeros_like(x)
    seg = int(0.01 * SR)
    for s in range(0, len(x), seg):
        c = 300 + bright * np.exp(-t[s] / 0.12)
        out[s:s + seg] = sosfilt(butter(2, min(c, 16000), fs=SR, output="sos"), x[s:s + seg + 256])[: len(out[s:s + seg])]
    return _fade(_norm(out * _env(dur, 0.35, 0.002)), 30)


def pluck(rng, note=60, dur=1.0):
    f = 440 * 2 ** ((note - 69) / 12)
    n = int(SR / f)
    buf = rng.uniform(-1, 1, n)
    out = np.zeros(int(dur * SR))
    for i in range(len(out)):
        out[i] = buf[i % n]
        buf[i % n] = 0.5 * (buf[i % n] + buf[(i + 1) % n]) * 0.996
    return _fade(_norm(out), 30)


def stereo(x, width=0.0, rng=None):
    if width <= 0:
        return np.stack([x, x])
    d = int(0.012 * SR * width)
    r = np.concatenate([np.zeros(d), x[:-d]]) if d else x
    return np.stack([x, x * (1 - width * 0.3) + r * width * 0.3])
