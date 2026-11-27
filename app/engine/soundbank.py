from __future__ import annotations

import json
import shutil
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

from . import samplegen as G

ESS_VERSION = 5
_LOCK = threading.Lock()
NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]

SONICPI = {"repo": "sonic-pi-net/sonic-pi", "sha": "129ce0bcaa92bff87059b356742e3aa1b91c47c4", "dir": "etc/samples/",
           "files": "ambi_choir ambi_dark_woosh ambi_drone ambi_glass_hum ambi_glass_rub ambi_haunted_hum ambi_lunar_land ambi_piano ambi_sauna ambi_soft_buzz ambi_swoosh arovane_beat_a arovane_beat_b arovane_beat_c arovane_beat_d arovane_beat_e bass_dnb_f bass_drop_c bass_hard_c bass_hit_c bass_thick_c bass_trance_c bass_voxy_c bass_voxy_hit_c bass_woodsy_c bd_808 bd_ada bd_boom bd_chip bd_fat bd_gas bd_haus bd_jazz bd_klub bd_mehackit bd_pure bd_sone bd_tek bd_zome bd_zum drum_bass_hard drum_bass_soft drum_cowbell drum_cymbal_closed drum_cymbal_hard drum_cymbal_open drum_cymbal_pedal drum_cymbal_soft drum_heavy_kick drum_roll drum_snare_hard drum_snare_soft drum_splash_hard drum_splash_soft drum_tom_hi_hard drum_tom_hi_soft drum_tom_lo_hard drum_tom_lo_soft drum_tom_mid_hard drum_tom_mid_soft elec_beep elec_bell elec_blip elec_blip2 elec_blup elec_bong elec_chime elec_cymbal elec_filt_snare elec_flip elec_fuzz_tom elec_hi_snare elec_hollow_kick elec_lo_snare elec_mid_snare elec_ping elec_plip elec_pop elec_snare elec_soft_kick elec_tick elec_triangle elec_twang elec_twip elec_wood glitch_bass_g glitch_perc1 glitch_perc2 glitch_perc3 glitch_perc4 glitch_perc5 glitch_robot1 glitch_robot2 guit_e_fifths guit_e_slide guit_em9 guit_harmonics hat_bdu hat_cab hat_cats hat_gem hat_gnu hat_gump hat_hier hat_len hat_mess hat_metal hat_noiz hat_psych hat_raw hat_sci hat_snap hat_star hat_tap hat_yosh hat_zan hat_zap hat_zild loop_3d_printer loop_amen loop_amen_full loop_breakbeat loop_compus loop_drone_g_97 loop_electric loop_garzul loop_industrial loop_mehackit1 loop_mehackit2 loop_mika loop_perc1 loop_perc2 loop_safari loop_tabla loop_weirdo mehackit_phone1 mehackit_phone2 mehackit_phone3 mehackit_phone4 mehackit_robot1 mehackit_robot2 mehackit_robot3 mehackit_robot4 mehackit_robot5 mehackit_robot6 mehackit_robot7 misc_burp misc_cineboom misc_crow perc_bell perc_bell2 perc_door perc_impact1 perc_impact2 perc_snap perc_snap2 perc_swash perc_swoosh perc_till ride_tri ride_via sn_dolf sn_dub sn_generic sn_zome tabla_dhec tabla_ghe1 tabla_ghe2 tabla_ghe3 tabla_ghe4 tabla_ghe5 tabla_ghe6 tabla_ghe7 tabla_ghe8 tabla_ke1 tabla_ke2 tabla_ke3 tabla_na tabla_na_o tabla_na_s tabla_re tabla_tas1 tabla_tas2 tabla_tas3 tabla_te1 tabla_te2 tabla_te_m tabla_te_ne tabla_tun1 tabla_tun2 tabla_tun3 vinyl_backspin vinyl_hiss vinyl_rewind vinyl_scratch".split()}
SP_CATS = [("loop_", "Лупи: брейки й ритми"), ("arovane_beat", "Лупи: брейки й ритми"), ("bd_", "Бочки"), ("drum_bass", "Бочки"), ("drum_heavy", "Бочки"),
           ("sn_", "Малі барабани"), ("drum_snare", "Малі барабани"), ("hat_", "Хети"), ("drum_cymbal_closed", "Хети"), ("drum_cymbal_pedal", "Хети"),
           ("drum_cymbal", "Тарілки"), ("drum_splash", "Тарілки"), ("ride_", "Тарілки"), ("drum_tom", "Томи"), ("drum_", "Перкусія"),
           ("tabla_", "Табла"), ("elec_", "Електронні звуки"), ("glitch_", "Гліч"), ("mehackit_", "Гліч"), ("bass_", "Басові звуки"),
           ("ambi_", "Атмосфери"), ("vinyl_", "Вініл і скретч"), ("guit_", "Гітарні фрази"), ("perc_", "Перкусія"), ("misc_", "Ефекти")]


def root() -> Path:
    from .project import workspace

    d = workspace() / "_library" / "soundbank"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _save(path: Path, y: np.ndarray, sr: int = G.SR):
    import soundfile as sf

    path.parent.mkdir(parents=True, exist_ok=True)
    y = np.atleast_2d(y)
    if y.shape[0] > y.shape[1]:
        y = y.T
    pk = float(np.max(np.abs(y))) if y.size else 0
    if pk > 0.999:
        y = y * (0.999 / pk)
    sf.write(str(path), y.T, sr, subtype="PCM_16")


def _index_path(pack: str) -> Path:
    return root() / pack / "index.json"


def _read_index(pack: str) -> list:
    try:
        return json.loads(_index_path(pack).read_text(encoding="utf-8"))["items"]
    except Exception:
        return []


def _write_index(pack: str, items: list, extra: dict | None = None):
    p = _index_path(pack)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(dict({"items": items, "at": time.time()}, **(extra or {})), ensure_ascii=False), encoding="utf-8")


KITS = {
    "trap": dict(kick=dict(f0=150, f1=45, tau=0.05, decay=0.45, drive=1.8), snare=dict(tone=210, noise_decay=0.12, mix=0.55), hat=dict(decay=0.035, tone=1.1), open=dict(decay=0.22), clap=dict(decay=0.16)),
    "boom": dict(kick=dict(f0=130, f1=52, tau=0.04, decay=0.28, click=0.9, drive=2.2), snare=dict(tone=175, noise_decay=0.2, mix=0.7, lo=900), hat=dict(decay=0.06, tone=0.9, hp=6000), open=dict(decay=0.3), clap=dict(decay=0.2)),
    "house": dict(kick=dict(f0=170, f1=50, tau=0.035, decay=0.3, click=0.6, drive=1.5), snare=dict(tone=200, noise_decay=0.14, mix=0.6), hat=dict(decay=0.045, tone=1.2, hp=8000), open=dict(decay=0.18, tone=1.2), clap=dict(decay=0.22, bursts=4)),
    "techno": dict(kick=dict(f0=180, f1=46, tau=0.03, decay=0.38, click=0.7, drive=2.6), snare=dict(tone=220, noise_decay=0.1, mix=0.6), hat=dict(decay=0.03, tone=1.3, hp=9000), open=dict(decay=0.14, tone=1.3), clap=dict(decay=0.25)),
    "dnb": dict(kick=dict(f0=200, f1=55, tau=0.03, decay=0.22, click=0.9, drive=1.6), snare=dict(tone=230, noise_decay=0.13, mix=0.62, lo=1500), hat=dict(decay=0.04, tone=1.15), open=dict(decay=0.2), clap=dict(decay=0.15)),
    "lofi": dict(kick=dict(f0=120, f1=50, tau=0.05, decay=0.3, click=0.3, drive=1.2), snare=dict(tone=170, noise_decay=0.18, mix=0.6, hi=6000), hat=dict(decay=0.05, tone=0.8, hp=5000), open=dict(decay=0.25, tone=0.8), clap=dict(decay=0.18, hi=3500)),
    "rock": dict(kick=dict(f0=140, f1=58, tau=0.03, decay=0.24, click=1.0, drive=1.3), snare=dict(tone=200, noise_decay=0.22, mix=0.66, lo=800), hat=dict(decay=0.07, tone=1.0, hp=6000), open=dict(decay=0.35), clap=dict(decay=0.2)),
}

GROOVES = [
    ("Трап", "trap", 140, 0.0, {"k": "x.........x.....|..x.......x..x..", "s": "........x.......|........x.......", "h": "x.x.x.x.x.x.x.x.|x.x.x.x.xxx.x.xx", "o": "..............x.|................"}),
    ("Трап", "trap", 145, 0.0, {"k": "x......x..x.....|x.....x...x.x...", "c": "........x.......|........x.......", "h": "xxx.x.xxx.x.xxxx|x.x.x.x.x.x.xxx."}),
    ("Трап", "trap", 130, 0.0, {"k": "x.........x...x.|..x...x.........", "s": "........x.......|........x....x..", "h": "x.x.x.x.x.x.x.x.|x.x.x.x.x.xxxxxx"}),
    ("Дрилл", "trap", 142, 0.0, {"k": "x.........x.....|...x......x.....", "s": "......x.......x.|....x.......x...", "h": "x..x..x.x..x..x.|x..x..x.x..x.xx."}),
    ("Дрилл", "trap", 144, 0.0, {"k": "x......x........|x.x........x....", "s": "......x.......x.|......x.....x...", "h": "x..x..x..x..x.x.|x..x..x..x.x.xx."}),
    ("Бум-бек", "boom", 90, 0.18, {"k": "x.......x.x.....|x..x....x.......", "s": "....x.......x...|....x.......x..x", "h": "x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.x."}),
    ("Бум-бек", "boom", 88, 0.2, {"k": "x..x......x.....|x.......x.x.....", "s": "....x.......x...|....x.......x...", "h": "x.x.x.x.x.x.x.x.|x.x.x.x.x.x.xxx.", "o": "..............x.|................"}),
    ("Бум-бек", "boom", 94, 0.15, {"k": "x.........x..x..|x......x..x.....", "s": "....x.......x...|....x.......x...", "h": "x.xxx.x.x.xxx.x.|x.xxx.x.x.xxx.x."}),
    ("Лоу-фай", "lofi", 80, 0.22, {"k": "x.......x.......|x.....x...x.....", "s": "....x.......x...|....x.......x...", "h": "x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.x."}),
    ("Лоу-фай", "lofi", 75, 0.25, {"k": "x......x..x.....|x.........x.....", "s": "....x.......x...|....x.......x.x.", "h": "x.xxx.x.x.xxx.x.|x.xxx.x.x.xxx.x."}),
    ("Хаус", "house", 124, 0.08, {"k": "x...x...x...x...|x...x...x...x...", "c": "....x.......x...|....x.......x...", "o": "..x...x...x...x.|..x...x...x...x.", "h": "x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.x."}),
    ("Хаус", "house", 122, 0.12, {"k": "x...x...x...x...|x...x...x...x...", "c": "....x.......x...|....x.......x...", "o": "..x...x...x...x.|..x...x...x...x.", "p": "...x..x....x..x.|.x....x....x..x."}),
    ("Хаус", "house", 126, 0.05, {"k": "x...x...x...x...|x...x...x...x..x", "s": "....x.......x...|....x.......x...", "h": "xxxxxxxxxxxxxxxx|xxxxxxxxxxxxxxxx", "o": "..x...x...x...x.|..x...x...x...x."}),
    ("Техно", "techno", 128, 0.0, {"k": "x...x...x...x...|x...x...x...x...", "o": "..x...x...x...x.|..x...x...x...x.", "h": "x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.x.", "c": "....x.......x...|....x.......x..."}),
    ("Техно", "techno", 132, 0.0, {"k": "x...x...x...x...|x...x...x...x...", "h": "xxxxxxxxxxxxxxxx|xxxxxxxxxxxxxxxx", "p": "..x..x....x..x..|..x..x....x...x."}),
    ("Драм-н-бейс", "dnb", 174, 0.0, {"k": "x.........x.....|..x.......x.....", "s": "....x.......x...|....x.......x..x", "h": "x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.x."}),
    ("Драм-н-бейс", "dnb", 172, 0.0, {"k": "x.x.......x.....|..........x..x..", "s": "....x.......x...|....x..x....x...", "h": "x.xxx.xxx.xxx.xx|x.xxx.xxx.xxx.xx"}),
    ("Регетон", "house", 95, 0.0, {"k": "x...x...x...x...|x...x...x...x...", "s": "...x..x....x..x.|...x..x....x..x.", "h": "x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.x."}),
    ("Афробіт", "house", 105, 0.12, {"k": "x.....x...x.....|x.....x...x..x..", "s": "....x.......x...|....x.......x...", "p": "x..x..x...x.x...|x..x..x...x.x...", "h": "..x...x...x...x.|..x...x...x...x."}),
    ("Поп", "house", 120, 0.0, {"k": "x.......x.x.....|x.......x.......", "c": "....x.......x...|....x.......x...", "h": "x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.x."}),
    ("Рок", "rock", 110, 0.0, {"k": "x.......x.x.....|x.......x.x.....", "s": "....x.......x...|....x.......x...", "h": "x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.x."}),
    ("Рок", "rock", 150, 0.0, {"k": "x.x.....x.x.....|x.x.....x.x...x.", "s": "....x.......x...|....x.......x.xx", "o": "x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.x."}),
]

PROGS = [
    ("Трап", 140, (9, "minor"), [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]], "Grand Piano"),
    ("Лоу-фай", 80, (2, "minor"), [[0, 3, 7, 10], [5, 8, 12, 15], [10, 14, 17, 21], [7, 10, 14, 17]], "Tine Electric Piano"),
    ("Поп", 120, (0, "major"), [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], "Grand Piano"),
    ("R&B", 90, (5, "major"), [[2, 5, 9, 12], [7, 11, 14, 17], [0, 4, 7, 11], [9, 12, 16, 19]], "FM Electric Piano"),
    ("Хаус", 124, (7, "minor"), [[0, 3, 7, 10], [5, 8, 12, 15], [3, 7, 10, 14], [10, 14, 17, 21]], "Warm Pad"),
    ("Ембієнт", 70, (4, "minor"), [[0, 3, 7, 14], [8, 12, 15, 19], [3, 7, 10, 14], [10, 14, 17, 22]], "Slow Strings"),
    ("Дрилл", 142, (1, "minor"), [[0, 3, 7], [8, 12, 15], [7, 11, 14], [0, 3, 7]], "Concert Choir"),
    ("Синтвейв", 100, (11, "minor"), [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]], "Polysynth"),
]


class _GS:
    def __init__(self):
        from . import content

        self.bank = content._gs()
        self.items = {x["name"]: x["index"] for x in content.builtin_list()} if self.bank else {}
        self.cache = {}

    def zones(self, name):
        idx = self.items.get(name)
        if idx is None:
            for k, v in self.items.items():
                if name.lower().split()[0] in k.lower():
                    idx = v
                    break
        if idx is None or self.bank is None:
            return []
        if idx not in self.cache:
            out = []
            for z in self.bank.zones(idx):
                y, sr, lp = self.bank.sample(z["sid"], z["off"])
                out.append(dict(z, y=y, sr=sr, lp=lp))
            self.cache[idx] = out
        return self.cache[idx]

    def note(self, name, pitch, vel, dur):
        zs = [z for z in self.zones(name) if z["lo"] <= pitch <= z["hi"] and z["vlo"] <= vel <= z["vhi"]]
        if not zs:
            return None
        total = int((dur + 0.6) * G.SR)
        out = np.zeros((2, total))
        for z in zs:
            rate = 2 ** ((pitch - z["root"]) / 12 + z["tune"] / 1200) * z["sr"] / G.SR
            src = z["y"]
            n = int(min(total, (len(src) - 1) / rate)) if not (z["loop"] and z["lp"]) else total
            pos = np.arange(n) * rate
            if z["loop"] and z["lp"]:
                ls, le = z["lp"]
                L = max(8, le - ls)
                pos = np.where(pos >= le, ls + np.mod(pos - ls, L), pos)
            pos = np.clip(pos, 0, len(src) - 2)
            i = pos.astype(int)
            fr = pos - i
            sig = src[i] * (1 - fr) + src[i + 1] * fr
            t = np.arange(n) / G.SR
            a = max(0.002, z["a"])
            env = np.minimum(1, t / a)
            if z["s"] < 0.999:
                env = env * (z["s"] + (1 - z["s"]) * np.exp(-np.maximum(0, t - a) / max(0.05, z["d"] / 3)))
            rel = np.where(t > dur, np.exp(-(t - dur) / max(0.05, min(1.5, z["r"]) / 3)), 1.0)
            sig = sig * env * rel * z["gain"] * (0.4 + 0.6 * vel / 127)
            pan = z["pan"]
            out[0, :n] += sig * (1 - max(0, pan))
            out[1, :n] += sig * (1 + min(0, pan))
        return out


def _place(buf, x, at):
    s = int(at * G.SR)
    if s >= buf.shape[1]:
        return
    x = np.atleast_2d(x)
    if x.shape[0] == 1:
        x = np.vstack([x, x])
    n = min(x.shape[1], buf.shape[1] - s)
    buf[:, s:s + n] += x[:, :n]


def _drum_loop(genre_kit, bpm, swing, pat, rng):
    kit = KITS[genre_kit]
    snd = {"k": G.kick(rng, **kit["kick"]), "s": G.snare(rng, **kit["snare"]), "c": G.clap(rng, **kit["clap"]),
           "h": G.hat(rng, **kit["hat"]), "o": G.hat(rng, **dict(kit["hat"], **kit["open"])), "p": G.perc(rng, "rim")}
    step = 60 / bpm / 4
    bars = 2
    total = bars * 16 * step
    buf = np.zeros((2, int((total + 1.0) * G.SR)))
    gain = {"k": 1.0, "s": 0.85, "c": 0.8, "h": 0.42, "o": 0.45, "p": 0.5}
    pan = {"h": 0.25, "o": 0.25, "p": -0.3}
    for k, line in pat.items():
        steps = line.replace("|", "")
        for i, ch in enumerate(steps):
            if ch != "x":
                continue
            at = i * step + (swing * step if i % 2 == 1 else 0)
            v = gain[k] * (0.82 + 0.18 * rng.random()) * (0.75 if k == "h" and i % 4 == 2 else 1.0)
            x = snd[k] * v
            pn = pan.get(k, 0)
            _place(buf, np.vstack([x * (1 - max(0, pn)), x * (1 + min(0, pn))]), at)
    tail = buf[:, int(total * G.SR):]
    loop = buf[:, :int(total * G.SR)].copy()
    loop[:, :tail.shape[1]] += tail[:, :min(tail.shape[1], loop.shape[1])]
    return loop


def _chord_loop(gs, name, bpm, key, prog, arp=False):
    beat = 60 / bpm
    bar = 4 * beat
    total = bar * len(prog)
    buf = np.zeros((2, int((total + 1.5) * G.SR)))
    base = 48 + key[0] if key[0] < 6 else 36 + key[0]
    for b, ch in enumerate(prog):
        notes = [base + 12 + iv for iv in ch]
        if arp:
            seq = notes + notes[1:-1][::-1]
            for k in range(8):
                x = gs.note(name, seq[k % len(seq)] + 12, 85, beat * 0.45)
                if x is not None:
                    _place(buf, x, b * bar + k * beat / 2)
        else:
            for n in notes:
                x = gs.note(name, n, 82, bar * 0.95)
                if x is not None:
                    _place(buf, x * 0.6, b * bar)
    tail = buf[:, int(total * G.SR):]
    loop = buf[:, :int(total * G.SR)].copy()
    loop[:, :tail.shape[1]] += tail[:, :min(tail.shape[1], loop.shape[1])]
    return loop


def _bass_loop(bpm, key, prog, rng, style="808"):
    beat = 60 / bpm
    bar = 4 * beat
    total = bar * len(prog)
    buf = np.zeros(int((total + 2) * G.SR))
    rootp = 36 + key[0]
    pattern = [(0, 1.5), (1.75, 0.5), (2.5, 1.25)] if style == "808" else [(0, 0.45), (0.5, 0.45), (1, 0.45), (1.5, 0.45), (2, 0.45), (2.5, 0.45), (3, 0.45), (3.5, 0.45)]
    for b, ch in enumerate(prog):
        p = rootp + ch[0]
        if p > 47:
            p -= 12
        f = 440 * 2 ** ((p - 69) / 12)
        for at, ln in pattern:
            x = G.bass808(rng, decay=ln * beat * 0.9, f=f, dur=ln * beat + 0.08) if style == "808" else G.reese(rng, f=f, dur=ln * beat)
            s = int((b * bar + at * beat) * G.SR)
            n = min(len(x), len(buf) - s)
            buf[s:s + n] += x[:n] * (0.9 if style == "808" else 0.6)
    loop = buf[:int(total * G.SR)].copy()
    return np.stack([loop, loop])


def build_essentials(progress=None) -> list:
    with _LOCK:
        d = root() / "essentials"
        idx = _index_path("essentials")
        try:
            if json.loads(idx.read_text(encoding="utf-8")).get("version") == ESS_VERSION:
                return _read_index("essentials")
        except Exception:
            pass
        shutil.rmtree(d, ignore_errors=True)
        d.mkdir(parents=True, exist_ok=True)
        rng = np.random.default_rng(7)
        items = []
        jobs = []

        def add(cat, name, fn, kind="hit", rootn=None, bpm=None, key=None, tags=""):
            jobs.append((cat, name, fn, kind, rootn, bpm, key, tags))

        for i, (f0, f1, tau, dec, cl, dr) in enumerate([(150, 45, .05, .45, .5, 1.8), (130, 52, .04, .28, .9, 2.2), (170, 50, .035, .3, .6, 1.5), (180, 46, .03, .38, .7, 2.6),
                                                       (200, 55, .03, .22, .9, 1.6), (120, 50, .05, .3, .3, 1.2), (140, 58, .03, .24, 1.0, 1.3), (160, 40, .06, .6, .4, 2.0),
                                                       (110, 44, .07, .5, .2, 1.1), (220, 60, .02, .18, 1.2, 3.0), (145, 48, .045, .35, .6, 4.0), (125, 42, .08, .7, .3, 1.4)]):
            add("Бочки", f"Бочка {i + 1:02d}", lambda r, a=(f0, f1, tau, dec, cl, dr): G.kick(r, f0=a[0], f1=a[1], tau=a[2], decay=a[3], click=a[4], drive=a[5]))
        for i, (tone, nd, mix, lo, hi) in enumerate([(210, .12, .55, 1200, 9000), (175, .2, .7, 900, 8000), (200, .14, .6, 1200, 10000), (230, .13, .62, 1500, 11000), (170, .18, .6, 1000, 6000),
                                                     (190, .25, .75, 800, 7000), (250, .09, .5, 2000, 12000), (160, .3, .8, 700, 5000), (220, .16, .45, 1300, 9000), (185, .11, .7, 1800, 14000)]):
            add("Малі барабани", f"Малий {i + 1:02d}", lambda r, a=(tone, nd, mix, lo, hi): G.snare(r, tone=a[0], noise_decay=a[1], mix=a[2], lo=a[3], hi=a[4]))
        for i, (dec, lo, hi, b) in enumerate([(.16, 900, 5000, 4), (.22, 800, 4000, 4), (.25, 1100, 6000, 5), (.12, 1000, 7000, 3), (.3, 700, 3500, 4), (.18, 1200, 8000, 6)]):
            add("Клепи", f"Клеп {i + 1:02d}", lambda r, a=(dec, lo, hi, b): G.clap(r, decay=a[0], lo=a[1], hi=a[2], bursts=a[3]))
        for i, (dec, hp, tone) in enumerate([(.035, 7000, 1.1), (.06, 6000, .9), (.045, 8000, 1.2), (.03, 9000, 1.3), (.05, 5000, .8), (.025, 10000, 1.4), (.08, 6500, 1.0), (.04, 7500, 1.05)]):
            add("Хети", f"Хет закритий {i + 1:02d}", lambda r, a=(dec, hp, tone): G.hat(r, decay=a[0], hp=a[1], tone=a[2]))
        for i, (dec, tone) in enumerate([(.22, 1.1), (.3, .9), (.18, 1.2), (.35, 1.0), (.25, .8)]):
            add("Хети", f"Хет відкритий {i + 1:02d}", lambda r, a=(dec, tone): G.hat(r, decay=a[0], tone=a[1], dur=0.8))
        for i, (dec, hp, tone, dur) in enumerate([(1.2, 5000, 1.0, 2.5), (2.0, 4000, .9, 3.5), (.8, 6000, 1.2, 2.0), (1.5, 3000, .8, 3.0)]):
            add("Тарілки", f"Тарілка {i + 1:02d}", lambda r, a=(dec, hp, tone, dur): G.cymbal(r, decay=a[0], hp=a[1], tone=a[2], dur=a[3]))
        for i, (f, dec) in enumerate([(220, .25), (160, .3), (110, .35), (80, .45)]):
            add("Томи", f"Том {['високий', 'середній', 'низький', 'підлоговий'][i]}", lambda r, a=(f, dec): G.tom(r, f=a[0], decay=a[1]))
        for k, n in [("rim", "Рімшот"), ("cowbell", "Ковбел"), ("shaker", "Шейкер"), ("tamb", "Тамбурин"), ("conga_hi", "Конга висока"), ("conga_lo", "Конга низька"),
                     ("woodblock", "Вудблок"), ("clave", "Клава"), ("snap", "Клацання пальцями"), ("bongo", "Бонго"), ("triangle", "Трикутник"), ("thump", "Удар долонею")]:
            add("Перкусія", n, lambda r, kk=k: G.perc(r, kk))
        for i, (dec, drop, drv, gl, nm) in enumerate([(1.0, 2.0, 1.6, 0, "класичний"), (1.8, 2.2, 1.4, 0, "довгий"), (0.5, 2.5, 1.8, 0, "короткий"), (1.2, 2.0, 4.0, 0, "дисторшн"),
                                                       (1.4, 3.0, 2.2, 0, "панчевий"), (1.6, 2.0, 1.6, -12, "з глайдом вниз"), (1.6, 2.0, 1.6, 12, "з глайдом вгору"), (2.4, 1.6, 1.2, 0, "саб")]):
            add("808 і баси", f"808 {nm}", lambda r, a=(dec, drop, drv, gl): G.bass808(r, decay=a[0], drop=a[1], drive=a[2], glide=a[3], dur=max(1.2, a[0] * 2)), kind="note", rootn=36)
        add("808 і баси", "Різ-бас", lambda r: G.reese(r), kind="note", rootn=36)
        for i, (dur, kind) in enumerate([(2.0, "noise"), (4.0, "noise"), (8.0, "noise"), (4.0, "tone")]):
            add("Ефекти й переходи", f"Райзер {['короткий', 'середній', 'довгий', 'тональний'][i]}", lambda r, a=(dur, kind): G.riser(r, a[0], a[1]))
        for i in range(3):
            add("Ефекти й переходи", f"Даунліфтер {i + 1}", lambda r, dd=(1.5, 3.0, 5.0)[i]: G.riser(r, dd, "noise")[::-1].copy())
        for i in range(4):
            add("Ефекти й переходи", f"Імпакт {i + 1}", lambda r, dd=(2.0, 3.0, 4.0, 5.0)[i]: G.impact(r, dd))
        for i in range(4):
            add("Ефекти й переходи", f"Свіш {i + 1}", lambda r, dd=(0.8, 1.2, 1.6, 2.4)[i]: G.whoosh(r, dd))
        add("Ефекти й переходи", "Реверс тарілки", lambda r: G.cymbal(r, decay=1.5, dur=3.0)[::-1].copy())
        add("Ефекти й переходи", "Вініловий шум", lambda r: G.vinyl(r, 8.0))
        for root_n, minor, nm in [(60, False, "мажор"), (60, True, "мінор")]:
            for j, br in enumerate((1800, 3200, 5200)):
                add("Акорди й плаки (one-shot)", f"Стаб {nm} {['темний', 'середній', 'яскравий'][j]}", lambda r, a=(root_n, minor, br): G.chord_stab(r, a[0], a[1], bright=a[2]), kind="note", rootn=60)
        for n in (48, 60, 72):
            add("Акорди й плаки (one-shot)", f"Плак {NAMES[n % 12]}{n // 12 - 1}", lambda r, nn=n: G.pluck(r, nn, 1.2), kind="note", rootn=n)
        for i, (genre, kit, bpm, sw, pat) in enumerate(GROOVES):
            add("Лупи ударних", f"{genre} {bpm} BPM {chr(65 + sum(1 for g in GROOVES[:i] if g[0] == genre))}", lambda r, a=(kit, bpm, sw, pat): _drum_loop(a[0], a[1], a[2], a[3], r), kind="loop", bpm=bpm, tags=genre)
        for pat_name, line in [("Хети 16-ті", "x.x.x.x.x.x.x.x.|x.x.x.x.xxx.x.xx"), ("Хети трап із ролами", "xxx.x.xxx.x.xxxx|x.x.x.x.x.xxxxxx"), ("Шейкер-груув", "xxxxxxxxxxxxxxxx|xxxxxxxxxxxxxxxx")]:
            for bpm in (100, 140):
                add("Лупи хетів і перкусії", f"{pat_name} {bpm} BPM", lambda r, a=(line, bpm): _drum_loop("house", a[1], 0.0, {"h": a[0]}, r), kind="loop", bpm=bpm)
        gs = _GS()
        for genre, bpm, key, prog, inst in PROGS:
            kname = f"{NAMES[key[0]]} {'мінор' if key[1] == 'minor' else 'мажор'}"
            add("Лупи акордів", f"{genre} · акорди · {kname} · {bpm} BPM", lambda r, a=(inst, bpm, key, prog): _chord_loop(gs, a[0], a[1], a[2], a[3]), kind="loop", bpm=bpm, key={"tonic": key[0], "mode": key[1]}, tags=genre)
            add("Лупи арпеджіо", f"{genre} · арпеджіо · {kname} · {bpm} BPM", lambda r, a=(bpm, key, prog): _chord_loop(gs, "Nylon Guitar" if a[0] < 110 else "Synth Mallet", a[0], a[1], a[2], arp=True), kind="loop", bpm=bpm, key={"tonic": key[0], "mode": key[1]}, tags=genre)
            add("Лупи басу", f"{genre} · {'808' if bpm >= 120 or genre in ('Трап', 'Дрилл') else 'бас'} · {kname} · {bpm} BPM", lambda r, a=(bpm, key, prog, genre): _bass_loop(a[0], a[1], a[2], r, "808" if a[0] >= 120 or a[3] in ("Трап", "Дрилл") else "reese"), kind="loop", bpm=bpm, key={"tonic": key[0], "mode": key[1]}, tags=genre)
        for k, (cat, name, fn, kind, rootn, bpm, key, tags) in enumerate(jobs):
            try:
                y = fn(rng)
            except Exception:
                continue
            if y is None or not np.size(y):
                continue
            y = np.atleast_2d(y)
            if y.shape[0] == 1:
                y = G.stereo(y[0], 0.0)
            y = G._norm(y, 0.89)
            fname = f"{k:03d}.wav"
            _save(d / fname, y)
            dur = y.shape[1] / G.SR
            items.append({"id": f"sb:essentials/{fname}", "name": name, "cat": cat, "kind": kind, "dur": round(dur, 3), "bpm": bpm, "key": key,
                          "root": rootn, "root_name": f"{NAMES[rootn % 12]}{rootn // 12 - 1}" if rootn is not None else None, "tags": tags, "pack": "essentials"})
            if progress:
                progress((k + 1) / len(jobs))
        _write_index("essentials", items, {"version": ESS_VERSION})
        return items


def sonicpi_status() -> dict:
    items = _read_index("sonicpi")
    return {"installed": bool(items), "count": len(SONICPI["files"])}


def install_sonicpi(progress=None, cancel=None) -> list:
    import soundfile as sf

    d = root() / "sonicpi"
    d.mkdir(parents=True, exist_ok=True)
    base = f"https://raw.githubusercontent.com/{SONICPI['repo']}/{SONICPI['sha']}/{SONICPI['dir']}"
    files = SONICPI["files"]
    done = [0]

    def get(name):
        if cancel and cancel():
            raise RuntimeError("Скасовано.")
        out = d / f"{name}.wav"
        if not out.exists():
            tmp = d / f"_{name}.flac"
            from .content import _fetch

            _fetch(base + name + ".flac", tmp, 6)
            y, sr = sf.read(str(tmp), dtype="float32", always_2d=True)
            _save(out, y.T, sr)
            tmp.unlink()
        done[0] += 1
        if progress:
            progress(0.85 * done[0] / len(files))
        return name

    with ThreadPoolExecutor(4) as ex:
        list(ex.map(get, files))
    from .creative import estimate_bpm

    items = []
    for k, name in enumerate(files):
        f = d / f"{name}.wav"
        info = sf.info(str(f))
        cat = next((c for p, c in SP_CATS if name.startswith(p)), "Ефекти")
        kind = "loop" if cat.startswith("Лупи") else "hit"
        bpm = None
        if kind == "loop":
            try:
                y, sr = sf.read(str(f), dtype="float32", always_2d=True)
                est = float(estimate_bpm(y.T, sr))
                dur = y.shape[0] / sr
                best = None
                for beats in (2, 4, 8, 16, 32):
                    cand = beats * 60 / dur
                    for mul in (0.5, 1, 2):
                        if 60 <= cand * mul <= 190:
                            err = abs(cand * mul - est) / est
                            if best is None or err < best[0]:
                                best = (err, cand * mul)
                if best and best[0] < 0.08:
                    bpm = round(best[1], 1)
                else:
                    cands = [b * 60 / dur for b in (2, 4, 8, 16, 32) if 85 <= b * 60 / dur <= 165]
                    bpm = round(min(cands, key=lambda c: abs(c - est)), 1) if cands else round(est, 1)
            except Exception:
                bpm = None
        rootn = 48 if name.endswith("_c") else 41 if name.endswith("_f") else 43 if name.endswith("_g") else None
        items.append({"id": f"sb:sonicpi/{name}.wav", "name": name.replace("_", " "), "cat": cat, "kind": "note" if rootn is not None else kind,
                      "dur": round(info.frames / info.samplerate, 3), "bpm": bpm, "key": None, "root": rootn,
                      "root_name": f"{NAMES[rootn % 12]}{rootn // 12 - 1}" if rootn is not None else None, "tags": "", "pack": "sonicpi"})
        if progress:
            progress(0.85 + 0.15 * (k + 1) / len(files))
    _write_index("sonicpi", items)
    return items


def remove_sonicpi():
    shutil.rmtree(root() / "sonicpi", ignore_errors=True)
    return {"ok": True}


def listing() -> dict:
    ess = _read_index("essentials")
    sp = _read_index("sonicpi")
    return {"items": ess + sp, "essentials": bool(ess), "sonicpi": bool(sp), "sonicpi_count": len(SONICPI["files"])}


def path(spec: str) -> Path | None:
    if not spec.startswith("sb:"):
        return None
    r = root().resolve()
    f = (r / spec[3:]).resolve()
    return f if r in f.parents and f.exists() else None


def fit(spec: str, factor: float, semis: float) -> bytes:
    import io

    import soundfile as sf

    from .creative import _stretch_hq

    f = path(spec)
    if not f:
        raise FileNotFoundError(spec)
    y, sr = sf.read(str(f), dtype="float32", always_2d=True)
    y = y.T
    if abs(factor - 1) > 1e-3 or abs(semis) > 1e-3:
        y = _stretch_hq(y, sr, factor, semis)
    pk = float(np.abs(y).max()) if y.size else 0
    if pk > 0.999:
        y = y * (0.999 / pk)
    buf = io.BytesIO()
    sf.write(buf, np.atleast_2d(y).T, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()
