from __future__ import annotations

import base64
import json
import os
import sys
from pathlib import Path


def _load(path: str, name: str | None = None, state: str | None = None):
    import pedalboard

    if path.startswith("builtin:"):
        kind = path.split(":", 1)[1]
        plug = getattr(pedalboard, kind)()
        return plug
    plug = pedalboard.load_plugin(path, plugin_name=name or None, initialization_timeout=30.0)
    if state:
        try:
            plug.raw_state = base64.b64decode(state)
        except Exception:
            pass
    return plug


def _info(plug, path, name):
    params = {}
    try:
        for k, p in list(plug.parameters.items())[:400]:
            try:
                params[k] = str(getattr(plug, k))
            except Exception:
                pass
    except Exception:
        pass
    return {"path": path, "name": name or getattr(plug, "name", Path(path).stem),
            "vendor": getattr(plug, "manufacturer_name", "") or "", "category": getattr(plug, "category", "") or "",
            "instrument": bool(getattr(plug, "is_instrument", False)), "params": len(params)}


def cmd_probe(a):
    import pedalboard

    path = a["path"]
    out = []
    try:
        names = pedalboard.VST3Plugin.get_plugin_names_for_file(path)
    except Exception:
        names = [None]
    for n in names[:16]:
        try:
            plug = _load(path, n)
            out.append(_info(plug, path, n))
        except Exception as e:
            out.append({"path": path, "name": n or Path(path).stem, "error": str(e)[:300]})
    return out


def _state(plug):
    try:
        return base64.b64encode(plug.raw_state).decode("ascii")
    except Exception:
        return None


def cmd_edit(a):
    plug = _load(a["path"], a.get("name"), a.get("state"))
    plug.show_editor()
    return {"state": _state(plug), "info": _info(plug, a["path"], a.get("name"))}


def cmd_process(a):
    import numpy as np
    import soundfile as sf

    plug = _load(a["path"], a.get("name"), a.get("state"))
    y, sr = sf.read(a["in"], dtype="float32", always_2d=True)
    y = y.T
    if y.shape[0] == 1:
        y = np.vstack([y, y])
    tail = int(sr * float(a.get("tail", 2.0)))
    x = np.concatenate([y, np.zeros((y.shape[0], tail), np.float32)], axis=1)
    out = plug(x, sr, reset=True)
    out = np.atleast_2d(out)
    if out.shape[0] == 1:
        out = np.vstack([out, out])
    keep = y.shape[1] + (tail if a.get("keep_tail") else 0)
    out = out[:2, :keep]
    if out.shape[1] < keep:
        out = np.pad(out, ((0, 0), (0, keep - out.shape[1])))
    sf.write(a["out"], out.T, sr, subtype="FLOAT")
    return {"ok": True, "latency": int(getattr(plug, "reported_latency_samples", 0) or 0)}


def cmd_render(a):
    import mido
    import numpy as np
    import soundfile as sf

    plug = _load(a["path"], a.get("name"), a.get("state"))
    if not getattr(plug, "is_instrument", False):
        raise RuntimeError("Цей плагін — ефект, а не інструмент.")
    sr = int(a.get("sr", 44100))
    events = []
    for s, d, p, v in a["notes"]:
        events.append((float(s), mido.Message("note_on", note=int(p), velocity=max(1, min(127, int(v))))))
        events.append((float(s) + max(0.01, float(d)), mido.Message("note_off", note=int(p), velocity=0)))
    events.sort(key=lambda e: (e[0], e[1].type == "note_on"))
    msgs = [(m, t) for t, m in events]
    dur = float(a["duration"])
    out = plug(msgs, duration=dur, sample_rate=sr, num_channels=2, reset=True)
    out = np.atleast_2d(out)
    sf.write(a["out"], out.T, sr, subtype="FLOAT")
    return {"ok": True, "peak": float(np.abs(out).max()) if out.size else 0.0}


def main():
    cmd, argf, outf = sys.argv[1], sys.argv[2], sys.argv[3]
    a = json.loads(Path(argf).read_text(encoding="utf-8"))
    try:
        res = {"probe": cmd_probe, "edit": cmd_edit, "process": cmd_process, "render": cmd_render}[cmd](a)
        Path(outf).write_text(json.dumps({"ok": True, "result": res}, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        Path(outf).write_text(json.dumps({"ok": False, "error": str(e)[:800]}, ensure_ascii=False), encoding="utf-8")
    sys.stdout.flush()
    os._exit(0)


if __name__ == "__main__":
    main()
