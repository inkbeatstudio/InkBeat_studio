from __future__ import annotations

import numpy as np


def _nice(x: float, steps=(20, 25, 30, 40, 50, 60, 70, 80, 100, 120, 150, 180, 200, 250, 300, 400, 500)) -> int:
    return int(min(steps, key=lambda s: abs(s - x)))


def analyze(y: np.ndarray, sr: int) -> dict:
    import librosa

    y = np.atleast_2d(y).astype(np.float32)
    m = y.mean(axis=0)
    hop = 512
    rms = librosa.feature.rms(y=m, hop_length=hop)[0]
    if rms.max() <= 1e-6:
        return {"silent": True}
    act = rms > np.percentile(rms, 95) * 10 ** (-30 / 20)
    S = np.abs(librosa.stft(m, n_fft=2048, hop_length=hop)) ** 2
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    Sa = S[:, act[: S.shape[1]]] if act.any() else S
    spec = Sa.mean(axis=1) + 1e-12
    cum = np.cumsum(spec) / spec.sum()
    low_cut = float(freqs[np.searchsorted(cum, 0.01)])
    rolloff = float(freqs[np.searchsorted(cum, 0.95)])
    centroid = float((freqs * spec).sum() / spec.sum())
    act_r = rms[act] if act.any() else rms
    peak = float(np.abs(m).max())
    crest = 20 * np.log10(peak / (np.sqrt(np.mean(act_r ** 2)) + 1e-9) + 1e-9)
    dyn_range = 20 * np.log10(np.percentile(act_r, 95) / (np.percentile(act_r, 10) + 1e-9) + 1e-9)
    if y.shape[0] >= 2:
        mid, side = (y[0] + y[1]) / 2, (y[0] - y[1]) / 2
        width = float(np.sqrt(np.mean(side ** 2)) / (np.sqrt(np.mean(mid ** 2)) + 1e-9))
    else:
        width = 0.0
    on = librosa.onset.onset_detect(y=m, sr=sr, hop_length=hop, units="frames", backtrack=True)
    att, sus = [], []
    for f in on[:400]:
        seg = rms[f: f + int(0.6 * sr / hop)]
        if len(seg) < 6 or seg.max() <= 0:
            continue
        pk = int(np.argmax(seg[: int(0.2 * sr / hop) + 1]))
        att.append(pk * hop / sr)
        j = pk + int(0.3 * sr / hop)
        if j < len(seg):
            sus.append(seg[j] / seg[pk])
    attack = float(np.median(att)) if att else 0.02
    sustain = float(np.median(sus)) if sus else 0.5
    db = 20 * np.log10(rms / (rms.max() + 1e-12) + 1e-12)
    tails = []
    i = 1
    while i < len(db) - 5:
        if db[i - 1] > -18 and db[i] <= -18:
            start = db[i - 1]
            j = i
            while j < len(db) - 1 and db[j] > start - 20 and db[j + 1] <= db[j] + 1.0 and j - i < int(3 * sr / hop):
                j += 1
            if db[j] <= start - 20:
                tails.append((j - i) * hop / sr * 3)
            i = j + 1
        else:
            i += 1
    rt60 = float(np.clip(np.median(tails), 0.2, 4.0)) if len(tails) >= 3 else None
    pk_f = float(freqs[np.argmax(spec)])
    rich = float(spec[freqs > max(4 * pk_f, 800)].sum() / spec.sum())
    return {"silent": False, "low_cut": round(low_cut, 1), "rolloff": round(rolloff), "centroid": round(centroid),
            "crest_db": round(float(crest), 1), "dyn_range_db": round(float(dyn_range), 1),
            "width": round(width, 3), "attack_s": round(attack, 3), "sustain": round(sustain, 3),
            "rt60": None if rt60 is None else round(rt60, 2), "peak_hz": round(pk_f), "richness": round(rich, 3)}


def _bright_word(c, role):
    norms = {"bass": (180, 600), "drums": (1500, 4500), "lead": (1200, 3000), "keys": (900, 2600),
             "guitar": (900, 2600), "pad": (800, 2200), "poly": (900, 2600), "mono_inst": (900, 2600)}
    lo, hi = norms.get(role, (900, 2600))
    return ("темний", -1) if c < lo else ("яскравий", 1) if c > hi else ("збалансований", 0)


def _space_word(rt):
    if rt is None:
        return "сухий / близький", 0.15
    if rt < 0.6:
        return "майже сухий", 0.12
    if rt < 1.4:
        return "помірний простір", 0.2
    if rt < 2.4:
        return "великий простір", 0.28
    return "дуже просторий", 0.35


def recommend(track: dict, f: dict, insert: int) -> dict:
    role, kind, name = track["role"], track["kind"], track["name"]
    if f.get("silent"):
        return {"instrument": None, "chain": [], "summary": "доріжка майже порожня"}
    bright, bdir = _bright_word(f["centroid"], role)
    space, wet = _space_word(f.get("rt60"))
    plucky = f["sustain"] < 0.35
    slow = f["attack_s"] > 0.06
    wide = f["width"] > 0.35
    character = []
    character.append(bright)
    character.append("коротка атака, затухає" if plucky else ("повільна атака, тягнеться" if slow else "тягучий звук"))
    character.append(space)
    if wide:
        character.append("широке стерео")

    inst = {}
    if role == "drums":
        inst = {"plugin": "FPC", "preset": "Пади із семплів пісні (папка Samples/Drums)",
                "alt": "Fruity Kick для бочки, або будь-який драм-кіт з браузера FL (Packs → Drums)",
                "how": "Канал FPC → перетягніть Kick 1.wav на пад C3 (36), Snare 1.wav на D3 (38), Closed Hat на F#3 (42), "
                       "Open Hat на A#3 (46), Crash на C#4 (49). MIDI барабанів уже в цій розкладці."}
    elif role == "bass":
        sub = f["centroid"] < 220 and f["richness"] < 0.02
        if sub:
            inst = {"plugin": "FLEX", "preset": "категорія Bass → 808 / Sub", "alt": "3x Osc (синус) або Sampler з Bass one-shot",
                    "how": "Мелодія баса вже в MIDI. Для звучання як в оригіналі — Sampler з файлом Bass - note … (root = вказана нота)."}
        elif plucky:
            inst = {"plugin": "BooBass", "preset": "Finger / Pick (бас-гітара)", "alt": "FLEX → Bass (Pluck)",
                    "how": "Якщо в оригіналі синт-бас — FLEX → Bass."}
        else:
            inst = {"plugin": "FLEX", "preset": "категорія Bass → Synth / Reese", "alt": "Sytrus (Producer+) → Bass",
                    "how": "Підберіть пресет, що ближче за яскравістю: оригінал " + bright + "."}
    elif role == "lead" and kind in ("vocals", "backing"):
        inst = {"plugin": "Аудіо-стем вокалу", "preset": "лишіть оригінальний голос у Playlist",
                "alt": "MIDI мелодії → FLEX (Lead / Vox) щоб зіграти мелодію синтом",
                "how": "Голос із текстом MIDI не передає. Використовуйте стем + MIDI як підказку для нової мелодії або дубля."}
    elif role == "keys" or kind == "piano":
        if plucky:
            inst = {"plugin": "FL Keys", "preset": "Grand Piano" if bdir >= 0 else "Rhodes / Electric",
                    "alt": "FLEX → Keys", "how": "FL Keys є в усіх редакціях FL Studio."}
        else:
            inst = {"plugin": "FLEX", "preset": "категорія Keys → Organ / E-Piano", "alt": "FL Keys (Rhodes)", "how": ""}
    elif role == "guitar":
        inst = {"plugin": "Sampler + Guitar one-shot", "preset": "файл із Samples/One-shots",
                "alt": "FLEX → Pluck (гітароподібні пресети)",
                "how": "Для акордів зручно взяти «chord stab» як семпл, а MIDI — для нових партій на FLEX."}
    elif kind == "chords":
        inst = {"plugin": "FLEX", "preset": "категорія Pad → Warm / Soft", "alt": "Sytrus (Producer+) → Pad",
                "how": "Доріжка акордів — гармонічна основа; можна тихо підкласти під оригінал."}
    else:
        if slow or (not plucky and f["sustain"] > 0.6):
            inst = {"plugin": "FLEX", "preset": "категорія Pad / Strings", "alt": "Sytrus (Producer+) → Pad", "how": ""}
        elif plucky:
            inst = {"plugin": "FLEX", "preset": "категорія Pluck", "alt": "3x Osc + Fruity Envelope", "how": ""}
        else:
            inst = {"plugin": "FLEX", "preset": "категорія Lead / Synth", "alt": "3x Osc", "how": ""}

    chain = []
    hp = 0 if role in ("bass", "drums") and f["low_cut"] < 45 else _nice(max(25, f["low_cut"] * 0.8))
    if role == "bass":
        hp = _nice(min(max(25, f["low_cut"] * 0.7), 40))
    eq = []
    if hp:
        eq.append(f"Low cut (HP) ≈ {hp} Гц")
    if bdir < 0 and role not in ("bass",):
        eq.append("High shelf +2…3 дБ від 8 кГц (додати повітря)")
    elif bdir > 0:
        eq.append("Зріз різкості −2 дБ близько 3–5 кГц")
    if role in ("keys", "guitar", "pad", "poly") or kind == "chords":
        eq.append("−2 дБ близько 250–400 Гц, щоб не бубнило з басом")
    if role == "lead" and kind == "vocals":
        eq.append("+2 дБ близько 3 кГц для розбірливості")
    chain.append({"plugin": "Fruity Parametric EQ 2", "settings": eq or ["рівний — додайте за смаком"]})

    crest = f["crest_db"]
    if role == "drums":
        chain.append({"plugin": "Fruity Compressor", "settings": ["Ratio 3:1, Attack 10–20 мс (щоб лишився удар), Release 80 мс",
                                                                   "Gain reduction 3–5 дБ"]})
    elif crest > 17:
        chain.append({"plugin": "Fruity Compressor", "settings": [f"Пік-фактор {crest:.0f} дБ — динамічно: Ratio 3:1",
                                                                   "Attack 5 мс, Release 100 мс, GR 4–6 дБ"]})
    elif crest > 11:
        chain.append({"plugin": "Fruity Compressor", "settings": [f"Пік-фактор {crest:.0f} дБ — помірно: Ratio 2:1",
                                                                   "Attack 10 мс, Release 120 мс, GR 2–3 дБ"]})
    else:
        chain.append({"plugin": "Fruity Limiter (режим COMP)", "settings": [f"Пік-фактор {crest:.0f} дБ — уже щільно стиснуто",
                                                                           "лише легке вирівнювання, GR ≤ 2 дБ"]})
    if role == "bass" and f["richness"] > 0.03:
        chain.append({"plugin": "Fruity Blood Overdrive", "settings": ["легка сатурація: PreAmp 10–20%, Mix 30%",
                                                                         "в оригіналі багато гармонік — бас «читається» на малих колонках"]})
    if wide and role not in ("bass", "drums"):
        chain.append({"plugin": "Fruity Stereo Shaper", "settings": [f"оригінал широкий (S/M = {f['width']:.2f}) — розширте стерео",
                                                                       "або два FLEX/синти з панорамою L/R"]})
    if role == "bass":
        chain.append({"plugin": "Fruity Stereo Shaper", "settings": ["бас у моно (Mid only) нижче 150 Гц"]})
    rt = f.get("rt60")
    if role != "bass":
        rv = [(f"Decay ≈ {rt:.1f} с" if rt and rt >= 0.6 else "Decay 0.8–1.0 с (оригінал сухий — ревер лише для глибини)"), f"Wet ≈ {int(wet * 100)}% (або send на шину Reverb)",
              "Pre-delay 20–40 мс" if role in ("lead",) else "Pre-delay 10–20 мс", f"оцінка простору оригіналу: {space}"]
        chain.append({"plugin": "Fruity Reeverb 2", "settings": rv, "send": "Reverb"})
    if role == "lead" or (role == "mono_inst"):
        chain.append({"plugin": "Fruity Delay 3", "settings": ["1/4 або 1/8 з крапкою, Feedback 25%, Wet 12–18%", "фільтр HP 300 Гц на ехо"],
                      "send": "Delay"})

    return {"insert": insert, "character": character, "instrument": inst, "chain": chain,
            "summary": ", ".join(character)}


MASTER_CHAIN = [
    {"plugin": "Fruity Parametric EQ 2", "settings": ["Low cut 25–30 Гц (прибрати інфрабас)"]},
    {"plugin": "Soundgoodizer", "settings": ["режим A, 10–25% — швидко «склеїти» мікс (за бажанням)"]},
    {"plugin": "Fruity Limiter", "settings": ["Ceiling −1.0 дБ, Gain до гучності референсу (Reference mix.wav)"]},
]
