from __future__ import annotations

from pathlib import Path

import numpy as np

from . import project as P


def lufs(y: np.ndarray, sr: int) -> float:
    from scipy.signal import lfilter

    y = np.atleast_2d(y).astype(np.float64)
    f0, g, q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    k = np.tan(np.pi * f0 / sr)
    vh = 10 ** (g / 20)
    vb = vh ** 0.4996667741545416
    a0 = 1 + k / q + k * k
    b1 = [(vh + vb * k / q + k * k) / a0, 2 * (k * k - vh) / a0, (vh - vb * k / q + k * k) / a0]
    a1 = [1, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0]
    f0, q = 38.13547087602444, 0.5003270373238773
    k = np.tan(np.pi * f0 / sr)
    b2 = [1, -2, 1]
    a2 = [1, 2 * (k * k - 1) / (1 + k / q + k * k), (1 - k / q + k * k) / (1 + k / q + k * k)]
    z = np.stack([lfilter(b2, a2, lfilter(b1, a1, ch)) for ch in y[:2]])
    blk, hop = int(0.4 * sr), int(0.1 * sr)
    if z.shape[1] < blk:
        return -70.0
    ms = np.array([np.mean(z[:, i:i + blk] ** 2, axis=1).sum() for i in range(0, z.shape[1] - blk, hop)])
    ld = -0.691 + 10 * np.log10(ms + 1e-12)
    ms = ms[ld > -70]
    if not len(ms):
        return -70.0
    rel = -0.691 + 10 * np.log10(ms.mean() + 1e-12) - 10
    ms2 = ms[(-0.691 + 10 * np.log10(ms + 1e-12)) > rel]
    return float(-0.691 + 10 * np.log10((ms2 if len(ms2) else ms).mean() + 1e-12))


def _limit(y: np.ndarray, sr: int, ceiling_db: float) -> np.ndarray:
    from scipy.ndimage import minimum_filter1d
    from scipy.signal import lfilter

    c = 10 ** (ceiling_db / 20)
    env = np.abs(np.atleast_2d(y)).max(axis=0)
    if env.max() <= c:
        return y
    need = np.minimum(1.0, c / (env + 1e-9))
    look = max(1, int(0.004 * sr))
    hold = minimum_filter1d(need, size=2 * look + 1)
    a = 1 - np.exp(-1 / (0.08 * sr))
    sm = lfilter([a], [1, -(1 - a)], hold, zi=[hold[0] * (1 - a)])[0]
    g = np.minimum(np.minimum(minimum_filter1d(sm, size=2 * look + 1), hold), 1.0)
    out = y * g
    return np.clip(out, -c, c).astype(np.float32)


def mix_path(pid: str) -> Path | None:
    d = P.workspace() / pid / "export"
    hits = sorted(d.rglob("* - mix.wav"), key=lambda f: f.stat().st_mtime) if d.exists() else []
    return hits[-1] if hits else None


def status(pids: list[str]) -> list[dict]:
    out = []
    for pid in pids:
        try:
            p = P.load_project(pid)
        except Exception:
            continue
        f = mix_path(pid)
        out.append({"pid": pid, "title": p["title"], "mix": bool(f), "duration": p.get("duration")})
    return out


def build(pids: list[str], opts: dict, progress=None) -> dict:
    import soundfile as sf

    from . import daw_export as DX

    title = (opts.get("title") or "Альбом").strip() or "Альбом"
    artist = (opts.get("artist") or "").strip()
    target = float(opts.get("target", -14))
    ceiling = float(opts.get("ceiling", -1))
    gap = max(0.0, float(opts.get("gap", 2)))
    out = P.workspace() / "_albums" / P.slugify(title)
    out.mkdir(parents=True, exist_ok=True)
    sr = 44100
    tracks, missing, full, cue, pos = [], [], [], [], 0.0
    for i, pid in enumerate(pids):
        f = mix_path(pid)
        p = P.load_project(pid)
        if not f:
            missing.append(p["title"])
            continue
        y, _ = P.load_audio(f, sr)
        y = np.atleast_2d(y)
        if y.shape[0] == 1:
            y = np.repeat(y, 2, axis=0)
        lu = lufs(y, sr)
        y = y * 10 ** ((target - lu) / 20)
        y = _limit(y, sr, ceiling)
        after = lufs(y, sr)
        n = len(tracks) + 1
        name = f"{n:02d} {P.slugify(p['title'])}"
        P.save_wav(out / f"{name}.wav", y, sr, "PCM_24")
        try:
            import lameenc

            enc = lameenc.Encoder()
            enc.set_bit_rate(320)
            enc.set_in_sample_rate(sr)
            enc.set_channels(2)
            enc.set_quality(2)
            pcm = (np.clip(y[:2].T, -1, 1) * 32767).astype(np.int16)
            (out / f"{name}.mp3").write_bytes(enc.encode(np.ascontiguousarray(pcm).tobytes()) + enc.flush())
            cov = P.workspace() / pid / "cover.jpg"
            DX.tag_mp3(out / f"{name}.mp3", {"title": p["title"], "artist": artist, "album": title, "year": opts.get("year", ""), "genre": opts.get("genre", ""), "track": f"{n}/{len(pids)}"}, cov if cov.exists() else None)
        except Exception:
            pass
        cue.append((n, p["title"], pos))
        full.append(y)
        pos += y.shape[1] / sr
        if gap and i < len(pids) - 1:
            full.append(np.zeros((2, int(gap * sr)), dtype=np.float32))
            pos += gap
        tracks.append({"n": n, "title": p["title"], "lufs_before": round(float(lu), 1), "lufs_after": round(float(after), 1), "peak_db": round(float(20 * np.log10(np.abs(y).max() + 1e-9)), 1)})
        if progress:
            progress((i + 1) / len(pids))
    if full:
        allw = np.concatenate(full, axis=1)
        P.save_wav(out / f"{P.slugify(title)} - повний альбом.wav", allw, sr, "PCM_24")
        lines = [f'PERFORMER "{artist}"', f'TITLE "{title}"', f'FILE "{P.slugify(title)} - повний альбом.wav" WAVE']
        for n, t, s in cue:
            m, sec = divmod(s, 60)
            fr = int(round((sec - int(sec)) * 75))
            lines += [f"  TRACK {n:02d} AUDIO", f'    TITLE "{t}"', f"    INDEX 01 {int(m):02d}:{int(sec):02d}:{min(fr, 74):02d}"]
        (out / f"{P.slugify(title)}.cue").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return {"dir": str(out), "tracks": tracks, "missing": missing}
