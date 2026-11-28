from __future__ import annotations

import json
import platform
import re
import sys
import threading
import time
import traceback
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

from . import updater as UPD

DIR = Path.home() / ".inkbeat"
LOG = DIR / "errors.jsonl"
SETTINGS = DIR / "settings.json"
_LOCK = threading.Lock()


def _scrub(text: str) -> str:
    text = str(text or "")
    home = str(Path.home())
    for h in {home, home.replace("\\", "/"), home.replace("/", "\\")}:
        if h and len(h) > 3:
            text = text.replace(h, "~")
    text = re.sub(r"(?i)([a-z]:\\users\\)[^\\\s]+", r"\1~", text)
    text = re.sub(r"/(home|Users)/[^/\s]+", r"/\1/~", text)
    text = re.sub(r"[\w.+-]+@[\w-]+\.[\w.]+", "<email>", text)
    return text[:12000]


def settings() -> dict:
    try:
        return json.loads(SETTINGS.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_settings(patch: dict) -> dict:
    with _LOCK:
        s = settings()
        for k, v in (patch or {}).items():
            if isinstance(k, str) and len(k) < 64:
                s[k] = v
        DIR.mkdir(parents=True, exist_ok=True)
        SETTINGS.write_text(json.dumps(s, ensure_ascii=False, indent=1), encoding="utf-8")
        return s


def system_info() -> dict:
    info = {"version": UPD.VERSION, "os": f"{platform.system()} {platform.release()}", "machine": platform.machine(),
            "python": sys.version.split()[0]}
    try:
        import torch

        info["gpu"] = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "none"
    except Exception:
        info["gpu"] = "n/a"
    return info


def record(kind: str, message: str, stack: str = "", context: dict | None = None) -> dict:
    item = {"id": uuid.uuid4().hex[:10], "at": time.strftime("%Y-%m-%d %H:%M:%S"), "kind": kind,
            "message": _scrub(message)[:600], "stack": _scrub(stack), "context": {k: _scrub(str(v))[:300] for k, v in (context or {}).items()},
            "sent": False}
    with _LOCK:
        DIR.mkdir(parents=True, exist_ok=True)
        lines = []
        if LOG.exists():
            lines = LOG.read_text(encoding="utf-8", errors="replace").splitlines()[-199:]
        lines.append(json.dumps(item, ensure_ascii=False))
        LOG.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return item


def record_exception(e: BaseException, where: str = "") -> dict:
    return record("engine", f"{type(e).__name__}: {e}", "".join(traceback.format_exception(type(e), e, e.__traceback__))[-6000:], {"where": where})


def items() -> list:
    if not LOG.exists():
        return []
    out = []
    for line in LOG.read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            out.append(json.loads(line))
        except Exception:
            pass
    return out[::-1]


def clear():
    with _LOCK:
        if LOG.exists():
            LOG.unlink()
    return {"ok": True}


def _mark_sent(ids):
    with _LOCK:
        its = items()[::-1]
        for it in its:
            if it["id"] in ids:
                it["sent"] = True
        LOG.write_text("\n".join(json.dumps(i, ensure_ascii=False) for i in its) + ("\n" if its else ""), encoding="utf-8")


def compose(ids: list, note: str = "") -> dict:
    sel = [i for i in items() if i["id"] in set(ids)] or items()[:1]
    info = system_info()
    head = " · ".join(f"{k}: {v}" for k, v in info.items())
    parts = [f"InkBeat {info['version']} — звіт про помилку", head]
    if note:
        parts.append("Що робив користувач: " + _scrub(note)[:1000])
    for it in sel:
        ctx = ", ".join(f"{k}={v}" for k, v in it.get("context", {}).items())
        parts.append(f"[{it['at']}] {it['kind']}: {it['message']}" + (f"\n{ctx}" if ctx else "") + (f"\n{it['stack'][:3000]}" if it.get("stack") else ""))
    return {"text": "\n\n".join(parts), "ids": [i["id"] for i in sel], "title": (sel[0]["message"][:90] if sel else "Помилка")}


def report_url() -> str:
    s = settings()
    if s.get("report_url"):
        return str(s["report_url"])
    return str(UPD.source().get("report_url") or "")


def send(ids: list, note: str = "") -> dict:
    c = compose(ids, note)
    url = report_url()
    if url.startswith("https://"):
        try:
            if "discord.com/api/webhooks" in url or "discordapp.com/api/webhooks" in url:
                body = json.dumps({"content": ("```\n" + c["text"][:1880] + "\n```")}).encode("utf-8")
            else:
                body = json.dumps({"title": c["title"], "text": c["text"], "app": "InkBeat"}).encode("utf-8")
            req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json", "User-Agent": f"InkBeat/{UPD.VERSION}"})
            with urllib.request.urlopen(req, timeout=20) as r:
                if r.status < 300:
                    _mark_sent(c["ids"])
                    return {"ok": True, "sent": True}
        except Exception as e:
            return {"ok": False, "sent": False, "error": str(e), "manual": _manual(c)}
    return {"ok": True, "sent": False, "manual": _manual(c)}


def _manual(c: dict) -> dict:
    repo = UPD.source().get("repo") or "inkbeatstudio/InkBeat_studio"
    body = c["text"]
    q = urllib.parse.urlencode({"title": "Помилка: " + c["title"], "body": body[:6000], "labels": "bug"})
    return {"issue_url": f"https://github.com/{repo}/issues/new?{q}", "text": body}
