from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path

from . import project as P


def ffmpeg_exe() -> str | None:
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return shutil.which("ffmpeg")


def out_dir(pid: str) -> Path:
    d = P.workspace() / pid / "video"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _name(pid: str, title: str, label: str, ext: str) -> Path:
    base = P.slugify(f"{title} - {label}")[:90] or "InkBeat video"
    d = out_dir(pid)
    f = d / f"{base}.{ext}"
    i = 2
    while f.exists():
        f = d / f"{base} ({i}).{ext}"
        i += 1
    return f


def _mix_wav(pid: str) -> Path | None:
    r = P.workspace() / pid / "render"
    found = sorted(r.glob("00*.wav")) if r.exists() else []
    return found[0] if found else None


def finish(pid: str, src: Path, title: str, label: str, hq: bool, audio_start: float, lead: float,
           duration: float, fps: int, progress=None) -> dict:
    ff = ffmpeg_exe()
    if not ff:
        dest = _name(pid, title, label, src.suffix.lstrip(".") or "webm")
        shutil.copy(src, dest)
        return {"file": dest.name, "path": str(dest), "converted": False,
                "note": "Модуль перетворення відео не знайдено — збережено у форматі WebM. Запустіть інсталятор ще раз, щоб отримати MP4."}
    dest = _name(pid, title, label, "mp4")
    cmd = [ff, "-y", "-hide_banner", "-loglevel", "error", "-progress", "pipe:1", "-i", str(src)]
    mix = _mix_wav(pid) if hq else None
    if mix is not None:
        if lead >= 0:
            cmd += ["-ss", f"{max(0.0, audio_start):.3f}", "-itsoffset", f"{lead:.3f}", "-i", str(mix)]
        else:
            cmd += ["-ss", f"{max(0.0, audio_start - lead):.3f}", "-i", str(mix)]
        cmd += ["-map", "0:v:0", "-map", "1:a:0"]
    else:
        cmd += ["-map", "0:v:0", "-map", "0:a:0?"]
    if duration > 0:
        cmd += ["-t", f"{duration:.3f}"]
    fade = []
    if duration > 3:
        fade = ["-af", f"afade=t=in:st=0:d=0.05,afade=t=out:st={duration - 1.2:.3f}:d=1.2"]
    cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", "-r", str(int(fps or 30)),
            "-fps_mode", "cfr", "-c:a", "aac", "-b:a", "192k", "-ar", "44100"] + fade + ["-movflags", "+faststart", str(dest)]
    flags = 0x08000000 if sys.platform == "win32" else 0
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, creationflags=flags)
    total = max(0.1, duration)
    for line in proc.stdout:
        m = re.match(r"out_time_ms=(\d+)", line.strip())
        if m and progress:
            progress(min(0.99, int(m.group(1)) / 1e6 / total))
    err = proc.stderr.read()
    if proc.wait() != 0 or not dest.exists():
        dest.unlink(missing_ok=True)
        raise RuntimeError("Не вдалося зібрати відео: " + (err.strip().splitlines() or ["невідома помилка"])[-1][:300])
    if progress:
        progress(1.0)
    return {"file": dest.name, "path": str(dest), "converted": True, "size": dest.stat().st_size, "hq": mix is not None}
