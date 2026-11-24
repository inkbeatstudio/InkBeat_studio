from __future__ import annotations

import re
from pathlib import Path

import numpy as np

MODELS = {
    "6": {"name": "htdemucs_6s", "label": "6 stems: vocals, drums, bass, guitar, keys, other"},
    "4": {"name": "htdemucs_ft", "label": "4 stems, maximum quality: vocals, drums, bass, other"},
    "4fast": {"name": "htdemucs", "label": "4 stems, fast"},
}

STEM_INFO = {
    "vocals": ("Lead Vocal", "lead", 53, "#f43f5e"),
    "backing": ("Backing Vocals", "pad", 52, "#fb7185"),
    "drums": ("Drums", "drums", 0, "#f59e0b"),
    "percussion": ("Percussion", "drums", 0, "#fbbf24"),
    "bass": ("Bass", "bass", 33, "#8b5cf6"),
    "guitar": ("Guitar", "guitar", 27, "#22c55e"),
    "piano": ("Keys", "keys", 0, "#3b82f6"),
    "synth": ("Synth", "poly", 81, "#06b6d4"),
    "strings": ("Strings", "pad", 48, "#14b8a6"),
    "brass": ("Brass", "mono_inst", 61, "#eab308"),
    "woodwinds": ("Woodwinds", "mono_inst", 73, "#84cc16"),
    "pad": ("Pad", "pad", 89, "#6366f1"),
    "fx": ("FX", "skip", 0, "#64748b"),
    "other": ("Other / Melody", "poly", 81, "#06b6d4"),
}

KEYWORDS = [
    (r"back(ing)?[\s_-]*vo|bvox|bgv|chor(us|al)?[\s_-]*vo|бек|бэк", "backing"),
    (r"vocal|vox|voice|sing|вокал|голос", "vocals"),
    (r"perc|shaker|conga|bongo|tamb|перкус", "percussion"),
    (r"drum|kick|snare|hat|beat|барабан|ударн", "drums"),
    (r"bass|808|бас", "bass"),
    (r"guitar|gtr|гітар|гитар", "guitar"),
    (r"piano|keys|keyboard|rhodes|organ|клавіш|клавиш|піаніно|пианино|фортеп", "piano"),
    (r"synth|lead|arp|pluck|синт", "synth"),
    (r"string|violin|cello|viola|orchestr|струн|скрип", "strings"),
    (r"brass|trumpet|horn|trombone|sax|дух|труб", "brass"),
    (r"wood|flute|clarinet|oboe|флейт", "woodwinds"),
    (r"\bpad\b|atmos|ambient", "pad"),
    (r"\bfx\b|sfx|effect|noise|riser|ефект|эффект", "fx"),
    (r"instrument|other|music|інше|другое", "other"),
]

AUDIO_EXT = {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".aif", ".aiff", ".opus"}


def classify_stem(filename: str) -> str:
    n = Path(filename).stem.lower()
    for pat, kind in KEYWORDS:
        if re.search(pat, n):
            return kind
    return "other"


def device_name() -> str:
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    return "cpu"


def separate(audio: np.ndarray, sr: int, model_key: str = "6", progress=None, log=None) -> dict:
    import torch
    import demucs.apply
    from demucs.pretrained import get_model

    name = MODELS.get(model_key, MODELS["6"])["name"]
    if log:
        log(f"Готую модуль розділення (перший раз завантажується, 80–300 МБ)…")
    model = get_model(name)
    model.eval()
    dev = device_name()
    if log:
        log(f"Розділяю на {'відеокарті' if dev == 'cuda' else 'процесорі'}…")
    msr = model.samplerate
    if sr != msr:
        import librosa

        audio = librosa.resample(audio, orig_sr=sr, target_sr=msr, axis=-1)
    if audio.shape[0] == 1:
        audio = np.concatenate([audio, audio], 0)
    audio = audio[:2]
    wav = torch.from_numpy(np.ascontiguousarray(audio)).float()
    ref = wav.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    wav = (wav - mean) / std

    n_models = len(getattr(model, "models", [model]))
    state = {"done_models": 0}

    class _Bar:
        def __init__(self, iterable=None, total=None, **kw):
            self.iterable = list(iterable) if iterable is not None else []
            self.total = len(self.iterable) or total or 1

        def __iter__(self):
            for i, x in enumerate(self.iterable):
                if progress:
                    progress(min(0.999, (state["done_models"] + (i + 1) / self.total) / n_models))
                yield x
            state["done_models"] += 1

        def update(self, *a, **k):
            pass

        def close(self):
            pass

    class _TqdmModule:
        tqdm = _Bar

    old = demucs.apply.tqdm
    demucs.apply.tqdm = _TqdmModule
    try:
        with torch.no_grad():
            out = demucs.apply.apply_model(model, wav[None], device=dev, shifts=1, split=True, overlap=0.25,
                                           progress=True, num_workers=0)[0]
    finally:
        demucs.apply.tqdm = old
    out = out * std + mean
    res = {}
    for i, src in enumerate(model.sources):
        res[src] = out[i].cpu().numpy().astype(np.float32)
    if progress:
        progress(1.0)
    return res, msr


def collect_stem_files(paths: list[Path]) -> list[tuple[Path, str]]:
    files = []
    for p in paths:
        p = Path(p)
        if p.is_dir():
            files += [f for f in sorted(p.iterdir()) if f.suffix.lower() in AUDIO_EXT]
        elif p.suffix.lower() in AUDIO_EXT:
            files.append(p)
    return [(f, classify_stem(f.name)) for f in files]
