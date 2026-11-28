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


def finish(pid: str, src: Path, title: str, label: str, audio: str, audio_file: Path | None, audio_start: float,
           lead: float, duration: float, fps: int, fade_in: bool = True, fade_out: bool = True, vcodec: str = "", progress=None) -> dict:
    ff = ffmpeg_exe()
    if not ff:
        dest = _name(pid, title, label, src.suffix.lstrip(".") or "webm")
        shutil.copy(src, dest)
        return {"file": dest.name, "path": str(dest), "converted": False,
                "note": "Модуль перетворення відео не знайдено — збережено як є. Запустіть інсталятор ще раз, щоб отримати MP4."}
    dest = _name(pid, title, label, "mp4")
    fps = int(fps or 30)
    cmd = [ff, "-y", "-hide_banner", "-loglevel", "error", "-progress", "pipe:1"]
    if vcodec == "h264":
        cmd += ["-f", "h264", "-r", str(fps), "-i", str(src)]
    elif vcodec == "ivf":
        cmd += ["-f", "ivf", "-r", str(fps), "-i", str(src)]
    else:
        cmd += ["-i", str(src)]
    a_in = None
    if audio == "mix":
        a_in = _mix_wav(pid)
    elif audio == "file" and audio_file is not None and audio_file.exists():
        a_in = audio_file
    if a_in is not None:
        if lead >= 0:
            if audio_start > 0:
                cmd += ["-ss", f"{audio_start:.3f}"]
            if lead > 0:
                cmd += ["-itsoffset", f"{lead:.3f}"]
            cmd += ["-i", str(a_in)]
        else:
            cmd += ["-ss", f"{max(0.0, audio_start - lead):.3f}", "-i", str(a_in)]
        cmd += ["-map", "0:v:0", "-map", "1:a:0"]
    else:
        cmd += ["-map", "0:v:0", "-map", "0:a:0?"]
    if duration > 0:
        cmd += ["-t", f"{duration:.3f}"]
    af = []
    if fade_in:
        af.append("afade=t=in:st=0:d=0.08")
    if fade_out and duration > 3:
        af.append(f"afade=t=out:st={duration - 1.5:.3f}:d=1.5")
    if vcodec == "h264":
        cmd += ["-c:v", "copy"]
    else:
        cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(fps), "-fps_mode", "cfr"]
    cmd += ["-c:a", "aac", "-b:a", "256k", "-ar", "48000"]
    if af:
        cmd += ["-af", ",".join(af)]
    cmd += ["-movflags", "+faststart", str(dest)]
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
    return {"file": dest.name, "path": str(dest), "converted": True, "size": dest.stat().st_size, "hq": audio == "mix"}


def cover_path(pid: str) -> Path:
    return P.workspace() / pid / "cover.jpg"


def save_cover(pid: str, src: Path) -> dict:
    from PIL import Image

    im = Image.open(src).convert("RGB")
    side = min(im.size)
    im = im.crop(((im.width - side) // 2, (im.height - side) // 2, (im.width + side) // 2, (im.height + side) // 2))
    im = im.resize((1200, 1200), Image.LANCZOS)
    im.save(cover_path(pid), "JPEG", quality=92)
    return {"ok": True}


MEDIA_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".mp4", ".webm", ".mov", ".m4v", ".ttf", ".otf", ".woff", ".woff2"}


def media_dir(pid: str) -> Path:
    d = P.workspace() / pid / "video_media"
    d.mkdir(parents=True, exist_ok=True)
    return d


def edit_path(pid: str) -> Path:
    return P.workspace() / pid / "video_edit.json"


def load_edit(pid: str) -> dict:
    f = edit_path(pid)
    if not f.exists():
        return {}
    try:
        import json
        return json.loads(f.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_edit(pid: str, doc: dict) -> None:
    import json
    f = edit_path(pid)
    tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    tmp.replace(f)


def save_media(pid: str, src: Path, name: str) -> dict:
    import hashlib
    ext = Path(name).suffix.lower()
    if ext not in MEDIA_EXT:
        raise ValueError("Цей тип файлу не підтримується. Підійдуть зображення, відео або шрифти.")
    h = hashlib.md5(src.read_bytes()).hexdigest()[:12]
    out = media_dir(pid) / (h + ext)
    if not out.exists():
        shutil.copyfile(src, out)
    return {"name": out.name, "orig": Path(name).name, "size": out.stat().st_size}
