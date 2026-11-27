from __future__ import annotations

import os
import queue
import shutil
import subprocess
import sys
import threading
import time
import traceback
import uuid
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_file, send_from_directory

from .engine import care as CARE
from .engine import updater as UPD
from .engine import video as VID
from .engine import extras as X
from .engine import project as P

UI_DIR = Path(__file__).resolve().parent / "ui"
app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 ** 3

JOBS: dict[str, P.Job] = {}
QUEUE: "queue.Queue[P.Job]" = queue.Queue()


def _worker():
    while True:
        job = QUEUE.get()
        if job.cancel:
            job.status = "cancelled"
            continue
        tmp = None
        try:
            if job.transform:
                job.status = "running"
                job.started = time.time()
                job.stage = "Зміна темпу і тональності"
                job.say("Перераховую доріжки під новий темп і тональність…")
                tmp = X.prepare_transform(job, job.say)
            P.analyze(job)
        except P.Cancelled:
            job.status = "cancelled"
            job.say("Скасовано.")
        except Exception as e:
            job.status = "error"
            job.error = _friendly(e)
            job.say("ПОМИЛКА: " + job.error)
            job.say(traceback.format_exc()[-1500:])
        finally:
            if tmp:
                shutil.rmtree(tmp, ignore_errors=True)


def _friendly(e: Exception) -> str:
    s = str(e)
    if "urlopen" in s or "HTTP Error" in s or "getaddrinfo" in s or "ConnectionError" in s:
        return ("Не вдалося завантажити модуль розділення. Перший запуск потребує інтернету "
                "(модуль завантажується один раз). Перевірте з'єднання і спробуйте ще раз.")
    if "CUDA out of memory" in s or "out of memory" in s.lower():
        return "Не вистачило пам'яті відеокарти. Закрийте інші програми або оберіть модель «4 стеми, швидко»."
    if isinstance(e, ModuleNotFoundError):
        return f"Не встановлено модуль {e.name}. Запустіть інсталятор ще раз."
    return s or e.__class__.__name__


threading.Thread(target=_worker, daemon=True).start()


@app.get("/")
def index():
    return send_from_directory(UI_DIR, "index.html")


@app.get("/ui/<path:name>")
def ui_file(name):
    return send_from_directory(UI_DIR, name)


@app.get("/api/system")
def system():
    info = {"version": P.VERSION, "workspace": str(P.workspace()), "device": "cpu", "separator": False,
            "python": sys.version.split()[0]}
    try:
        import torch

        info["device"] = "cuda" if torch.cuda.is_available() else ("mps" if getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available() else "cpu")
        if info["device"] == "cuda":
            info["gpu"] = torch.cuda.get_device_name(0)
        import demucs

        info["separator"] = True
    except Exception:
        pass
    return jsonify(info)


def _start(inputs, form, batch=None):
    job = P.Job(id=uuid.uuid4().hex[:10], inputs=[str(i) for i in inputs], mode=form.get("mode", "auto"),
                model=form.get("model", "6"), title=(form.get("title") or "").strip() or None, batch=batch)
    JOBS[job.id] = job
    job.say("У черзі…")
    QUEUE.put(job)
    return jsonify({"job_id": job.id})


@app.post("/api/upload")
def upload():
    files = request.files.getlist("files")
    if not files:
        abort(400, "no files")
    up = P.workspace() / "_uploads" / uuid.uuid4().hex[:10]
    up.mkdir(parents=True, exist_ok=True)
    saved = []
    for f in files:
        name = Path(f.filename or "audio.wav").name
        dest = up / name
        n = 2
        while dest.exists():
            dest = up / f"{Path(name).stem} ({n}){Path(name).suffix}"
            n += 1
        f.save(dest)
        saved.append(dest)
    form = dict(request.form)
    if form.get("batch") == "1" and len(saved) > 1:
        bid = uuid.uuid4().hex[:8]
        ids = []
        for f in saved:
            r = _start([f], {"mode": "mix", "model": form.get("model", "6"), "title": f.stem}, batch=bid)
            ids.append(r.get_json()["job_id"])
        return jsonify({"batch": bid, "jobs": ids})
    if not form.get("title"):
        rel = files[0].filename or ""
        if "/" in rel and form.get("mode") != "mix":
            form["title"] = rel.split("/")[0]
        elif len(saved) > 1:
            form["title"] = _common_title([x.stem for x in saved])
    inputs = [up] if len(saved) > 1 else saved
    return _start(inputs, form)


def _common_title(stems: list[str]) -> str:
    import os
    import re

    pre = os.path.commonprefix(stems)
    pre = re.sub(r"[\s(\[_\-–—.]+$", "", pre).strip()
    if len(pre) >= 3:
        return pre
    return re.sub(r"[\s(\[_\-–—]*(vocals?|drums?|bass|other|guitar|piano|keys?|stem.*)[)\]]*$", "", stems[0], flags=re.I).strip() or "Пісня"


@app.post("/api/analyze_path")
def analyze_path():
    data = request.get_json(force=True)
    paths = [Path(p.strip().strip('"')) for p in data.get("paths", []) if p.strip()]
    missing = [str(p) for p in paths if not p.exists()]
    if not paths or missing:
        return jsonify({"error": "Шлях не знайдено: " + ", ".join(missing or ["(порожньо)"])}), 400
    if data.get("batch") and len(paths) > 1:
        bid = uuid.uuid4().hex[:8]
        ids = [_start([x], {"mode": "mix", "model": data.get("model", "6"), "title": x.stem}, batch=bid).get_json()["job_id"]
               for x in paths]
        return jsonify({"batch": bid, "jobs": ids})
    return _start(paths, data)


@app.get("/api/job/<jid>")
def job_status(jid):
    j = JOBS.get(jid)
    if not j:
        abort(404)
    return jsonify(j.public())


@app.get("/api/jobs")
def jobs_list():
    b = request.args.get("batch")
    return jsonify([j.public() for j in JOBS.values() if not b or j.batch == b])


_PING = {"t": 0.0}


@app.post("/api/ping")
def ping():
    _PING["t"] = time.time()
    return jsonify({"ok": True})


@app.get("/api/busy")
def busy_get():
    return jsonify({"busy": busy()})


def busy() -> bool:
    return any(j.status in ("queued", "running") for j in JOBS.values()) or \
        any(j.get("status") == "running" for j in PROC_JOBS.values())


@app.post("/api/job/<jid>/cancel")
def job_cancel(jid):
    j = JOBS.get(jid)
    if j:
        j.cancel = True
    return jsonify({"ok": True})


def _pdir(pid):
    d = P.workspace() / Path(pid).name
    if not (d / "project.json").exists():
        abort(404)
    return d


@app.get("/api/projects")
def projects():
    return jsonify(P.list_projects())


@app.get("/api/project/<pid>")
def project_get(pid):
    try:
        CARE.recover_mix(P.workspace() / Path(pid).name)
    except Exception:
        pass
    _pdir(pid)
    return jsonify(P.build(pid))


@app.post("/api/project/<pid>/build")
def project_build(pid):
    _pdir(pid)
    patch = request.get_json(force=True) or {}
    return jsonify(P.build(pid, patch))


@app.post("/api/project/<pid>/rename")
def project_rename(pid):
    _pdir(pid)
    p = P.load_project(pid)
    title = P.slugify((request.get_json(force=True) or {}).get("title", "")) or p["title"]
    p["title"] = title
    P.save_project(p)
    return jsonify(P.build(pid))


@app.post("/api/project/<pid>/reset")
def project_reset(pid):
    _pdir(pid)
    p = P.load_project(pid)
    import json

    p["settings"] = json.loads(json.dumps(P.DEFAULT_SETTINGS))
    P.save_project(p)
    return jsonify(P.build(pid))


@app.post("/api/project/<pid>/export")
def project_export(pid):
    _pdir(pid)
    try:
        return jsonify(P.export(pid, request.get_json(silent=True) or {}))
    except Exception as e:
        return jsonify({"error": _friendly(e), "trace": traceback.format_exc()[-1200:]}), 500


@app.post("/api/project/<pid>/open")
def project_open(pid):
    d = _pdir(pid)
    target = d / "export"
    sub = [x for x in target.iterdir()] if target.exists() else []
    target = sub[0] if len(sub) == 1 else (target if target.exists() else d)
    _open_folder(target)
    return jsonify({"ok": True, "path": str(target)})


def _open_folder(path: Path):
    try:
        if sys.platform.startswith("win"):
            os.startfile(str(path))
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(path)])
        else:
            subprocess.Popen(["xdg-open", str(path)])
    except Exception:
        pass


@app.delete("/api/project/<pid>")
def project_delete(pid):
    d = _pdir(pid)
    shutil.rmtree(d, ignore_errors=True)
    return jsonify({"ok": True})


@app.get("/api/project/<pid>/audio/<tid>")
def project_audio(pid, tid):
    d = _pdir(pid)
    f = d / "preview" / f"{Path(tid).name}.wav"
    if not f.exists():
        abort(404)
    return send_file(f, mimetype="audio/wav", max_age=3600, conditional=True)


from .engine import processing as PR

PROC_JOBS: dict[str, dict] = {}


@app.post("/api/project/<pid>/process")
def project_process(pid):
    d = _pdir(pid)
    data = request.get_json(force=True) or {}
    jid = uuid.uuid4().hex[:10]
    job = {"id": jid, "status": "running", "progress": 0.0, "result": None, "error": None}
    PROC_JOBS[jid] = job

    def work():
        try:
            p = P.load_project(pid)
            job["result"] = PR.run_op(d, p, data["base"], data.get("source"), data["op"], data.get("params", {}),
                                      progress=lambda f: job.__setitem__("progress", float(f)))
            job["status"] = "done"
        except Exception as e:
            job["status"] = "error"
            job["error"] = _friendly(e)
            job["trace"] = traceback.format_exc()[-1500:]

    threading.Thread(target=work, daemon=True).start()
    return jsonify({"job": jid})


@app.post("/api/project/<pid>/preview")
def project_preview(pid):
    import io

    d = _pdir(pid)
    data = request.get_json(force=True) or {}
    try:
        wav = PR.preview_wav(d, P.load_project(pid), data["base"], data.get("source"), data.get("op", "none"),
                             data.get("params", {}), float(data.get("start", 0)), float(data.get("dur", 10)))
    except Exception as e:
        return jsonify({"error": _friendly(e)}), 500
    return send_file(io.BytesIO(wav), mimetype="audio/wav", max_age=0)


@app.get("/api/project/<pid>/soundfont")
def soundfont_list(pid):
    from .engine import soundfont as SFT

    return jsonify(SFT.list_libs(_pdir(pid)))


@app.post("/api/project/<pid>/soundfont")
def soundfont_add(pid):
    from .engine import soundfont as SFT

    d = _pdir(pid)
    tmp = None
    try:
        if request.files.get("file"):
            f = request.files["file"]
            tmpd = d / "cache" / "sf_upload"
            tmpd.mkdir(parents=True, exist_ok=True)
            suf = Path(f.filename or "x.sf2").suffix.lower()
            tmp = tmpd / (uuid.uuid4().hex[:8] + suf)
            f.save(tmp)
            meta = SFT.import_file(d, tmp, Path(f.filename or "SoundFont").stem)
        else:
            data = request.get_json(force=True) or {}
            if request.remote_addr not in ("127.0.0.1", "::1"):
                abort(403)
            meta = SFT.import_file(d, Path(data["path"]))
        return jsonify(meta)
    except Exception as e:
        return jsonify({"error": _friendly(e)}), 400
    finally:
        if tmp:
            tmp.unlink(missing_ok=True)


@app.post("/api/project/<pid>/soundfont/<lid>/preset")
def soundfont_preset(pid, lid):
    from .engine import soundfont as SFT

    data = request.get_json(force=True) or {}
    try:
        return jsonify(SFT.load_preset(_pdir(pid), Path(lid).name, int(data.get("index", 0))))
    except Exception as e:
        return jsonify({"error": _friendly(e)}), 400


@app.post("/api/project/<pid>/slice")
def project_slice(pid):
    d = _pdir(pid)
    data = request.get_json(force=True) or {}
    jid = uuid.uuid4().hex[:10]
    job = {"id": jid, "status": "running", "progress": 0.0, "result": None, "error": None}
    PROC_JOBS[jid] = job

    def work():
        try:
            from .engine import creative as CR
            from .engine.project import load_audio
            from .engine.soundfont import lib_dir

            src = data.get("source")
            path = PR.Versions(d).path(src) if src else d / "stems" / f"{Path(data['base']).name}.wav"
            y, sr = load_audio(path)
            a = max(0.0, float(data.get("from") or 0))
            b = float(data.get("to") or y.shape[1] / sr)
            y = y[:, int(a * sr): int(b * sr)]
            sid = "slice" + uuid.uuid4().hex[:6]
            out = lib_dir(d) / sid
            sl = CR.slice_audio(y, sr, out, f"_instruments/{sid}", float(data.get("sensitivity", 0.5)), int(data.get("max", 32)),
                                lambda f: job.__setitem__("progress", float(f)))
            for s_ in sl:
                s_["start"] += a
            job["result"] = {"slices": sl}
            job["status"] = "done"
        except Exception as e:
            job["status"] = "error"
            job["error"] = _friendly(e)
            job["trace"] = traceback.format_exc()[-1500:]

    threading.Thread(target=work, daemon=True).start()
    return jsonify({"job": jid})


@app.post("/api/project/<pid>/practice")
def project_practice(pid):
    import numpy as np
    import soundfile as sf

    d = _pdir(pid)
    data = request.get_json(force=True) or {}
    try:
        from .engine.creative import _stretch_hq
        from .engine.project import load_audio

        p = P.load_project(pid)
        srcs = data.get("sources") or {}
        excl = set(data.get("exclude") or [])
        a, b = max(0.0, float(data.get("from", 0))), float(data.get("to", 30))
        mix, sr = None, None
        for t in p["tracks"]:
            if t["id"] in excl or (t.get("settings") or {}).get("removed"):
                continue
            src = srcs.get(t["id"])
            path = PR.Versions(d).path(src) if src else d / "stems" / f"{t['id']}.wav"
            if not path.exists():
                continue
            y, sr = load_audio(path)
            y = y[:, int(a * sr): int(b * sr)]
            if mix is None:
                mix = y.copy()
            else:
                n = min(mix.shape[1], y.shape[1])
                mix = mix[:, :n] + y[:, :n]
        if mix is None:
            return jsonify({"error": "Немає звуку для цього фрагмента."}), 400
        speed = max(0.3, min(1.5, float(data.get("speed", 1.0))))
        if abs(speed - 1.0) > 1e-3:
            mix = _stretch_hq(mix, sr, 1.0 / speed)
        pk = float(np.abs(mix).max()) or 1.0
        if pk > 0.98:
            mix = mix * (0.98 / pk)
        out = d / "cache" / "practice.wav"
        out.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(out), mix.T, sr, subtype="PCM_16")
        return jsonify({"url": f"/api/project/{pid}/practice.wav?t={uuid.uuid4().hex[:6]}", "duration": mix.shape[1] / sr})
    except Exception as e:
        return jsonify({"error": _friendly(e)}), 500


@app.post("/api/project/<pid>/save_text")
def project_save_text(pid):
    d = _pdir(pid)
    data = request.get_json(force=True) or {}
    name = Path(str(data.get("name") or "file.txt")).name
    if not name or Path(name).suffix.lower() not in (".musicxml", ".xml", ".txt", ".svg", ".html"):
        return jsonify({"error": "Недозволений тип файлу."}), 400
    sub = Path(str(data.get("folder") or "")).name
    out = d / "export" / "Ноти" if not sub else d / "export" / sub
    out.mkdir(parents=True, exist_ok=True)
    (out / name).write_text(str(data.get("text") or ""), encoding="utf-8")
    return jsonify({"path": str(out / name)})


@app.post("/api/project/<pid>/open_path")
def project_open_path(pid):
    d = _pdir(pid)
    data = request.get_json(force=True) or {}
    p = Path(str(data.get("path") or ""))
    try:
        p = p.resolve()
        if d.resolve() not in p.parents:
            abort(403)
    except Exception:
        abort(400)
    _open_folder(p if p.is_dir() else p.parent)
    return jsonify({"ok": True})


@app.get("/api/project/<pid>/practice.wav")
def project_practice_wav(pid):
    f = _pdir(pid) / "cache" / "practice.wav"
    if not f.exists():
        abort(404)
    return send_file(f, mimetype="audio/wav", max_age=0)


@app.post("/api/project/<pid>/to_notes")
def project_to_notes(pid):
    d = _pdir(pid)
    data = request.get_json(force=True) or {}
    jid = uuid.uuid4().hex[:10]
    job = {"id": jid, "status": "running", "progress": 0.0, "result": None, "error": None}
    PROC_JOBS[jid] = job

    def work():
        try:
            from .engine import creative as CR
            from .engine.project import load_audio

            src = data.get("source")
            path = PR.Versions(d).path(src) if src else d / "stems" / f"{Path(data['base']).name}.wav"
            y, sr = load_audio(path)
            a, b = data.get("from"), data.get("to")
            off = 0.0
            if a is not None and b is not None and float(b) > float(a):
                off = max(0.0, float(a))
                y = y[:, int(off * sr): int(float(b) * sr)]
            prog = lambda f: job.__setitem__("progress", float(f))
            if data.get("kind") == "drums":
                notes = CR.beatbox_notes(y, sr, float(data.get("sensitivity", 0.5)), prog)
            else:
                notes = CR.hum_notes(y, sr, prog)
            for n in notes:
                n[0] += off
            job["result"] = {"notes": notes, "bpm": CR.estimate_bpm(y, sr) if data.get("kind") == "drums" and len(notes) > 4 else None}
            job["status"] = "done"
        except Exception as e:
            job["status"] = "error"
            job["error"] = _friendly(e)
            job["trace"] = traceback.format_exc()[-1500:]

    threading.Thread(target=work, daemon=True).start()
    return jsonify({"job": jid})


PHONE: dict = {"srv": None, "token": None, "port": None, "ip": None}
PHONE_PAGE = (Path(__file__).parent / "ui" / "phone.html")


def _phone_dir() -> Path:
    d = P.workspace() / "_phone_inbox"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _lan_ip() -> str:
    import socket

    s2 = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s2.connect(("10.255.255.255", 1))
        return s2.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s2.close()


FW_RULE = "InkBeat-Phone"


def _firewall() -> str:
    if sys.platform != "win32":
        return "n/a"
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    try:
        r = subprocess.run(["netsh", "advfirewall", "firewall", "show", "rule", f"name={FW_RULE}"],
                           capture_output=True, timeout=15, creationflags=flags)
        if r.returncode == 0:
            return "ok"
    except Exception:
        return "unknown"
    args = (f'advfirewall firewall add rule name={FW_RULE} dir=in action=allow protocol=TCP '
            f'localport=47900-47919 remoteip=localsubnet profile=any enable=yes')
    ps = f"Start-Process -FilePath netsh -ArgumentList '{args}' -Verb RunAs -WindowStyle Hidden -Wait"
    try:
        subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
                       capture_output=True, timeout=180, creationflags=flags)
        r = subprocess.run(["netsh", "advfirewall", "firewall", "show", "rule", f"name={FW_RULE}"],
                           capture_output=True, timeout=15, creationflags=flags)
        return "added" if r.returncode == 0 else "declined"
    except Exception:
        return "declined"


def _phone_app():
    import json as _json
    import secrets

    from flask import Flask, Response

    papp = Flask("inkbeat_phone")
    papp.config["MAX_CONTENT_LENGTH"] = 80 * 1024 * 1024

    def ok():
        return request.args.get("k") and secrets.compare_digest(str(request.args.get("k")), str(PHONE["token"]))

    @papp.get("/")
    def ph_index():
        if not ok():
            return Response("InkBeat: open the address with the code shown in the app.", status=403, mimetype="text/plain; charset=utf-8")
        return Response(PHONE_PAGE.read_text(encoding="utf-8"), mimetype="text/html; charset=utf-8")

    @papp.post("/up")
    def ph_up():
        if not ok():
            abort(403)
        iid = time.strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:4]
        meta = {"id": iid, "name": (request.form.get("name") or "").strip()[:60], "text": (request.form.get("text") or "")[:4000], "kind": request.form.get("kind", "idea"), "time": time.time(), "file": None}
        f = request.files.get("file")
        if f and f.filename:
            ext = Path(f.filename).suffix.lower()
            if ext not in (".wav", ".mp3", ".m4a", ".aac", ".ogg", ".opus", ".webm", ".3gp", ".amr", ".flac", ".caf", ".mp4"):
                ext = ".m4a"
            dest = _phone_dir() / (iid + ext)
            f.save(dest)
            meta["file"] = dest.name
        (_phone_dir() / (iid + ".json")).write_text(_json.dumps(meta, ensure_ascii=False), encoding="utf-8")
        return jsonify({"ok": True})

    return papp


@app.get("/api/content/builtin")
def content_builtin():
    from .engine import content as CT

    return jsonify({"items": CT.builtin_list()})


@app.post("/api/project/<pid>/content/builtin")
def content_builtin_zones(pid):
    from .engine import content as CT

    data = request.get_json(force=True) or {}
    try:
        return jsonify(CT.builtin_zones(_pdir(pid), int(data.get("index", 0))))
    except Exception as e:
        return jsonify({"error": _friendly(e)}), 400


@app.get("/api/content/packs")
def content_packs():
    from .engine import content as CT

    return jsonify({"packs": CT.packs_status()})


@app.get("/api/content/pack/<pack>/<inst>")
def content_pack_zones(pack, inst):
    from .engine import content as CT

    try:
        return jsonify(CT.pack_zones(pack, inst))
    except Exception as e:
        return jsonify({"error": _friendly(e)}), 404


@app.post("/api/content/install")
def content_install():
    from .engine import content as CT

    data = request.get_json(force=True) or {}
    jid = uuid.uuid4().hex[:10]
    job = {"id": jid, "status": "running", "progress": 0.0, "result": None, "error": None, "cancel": False}
    PROC_JOBS[jid] = job

    def work():
        try:
            job["result"] = CT.install(str(data.get("pack")), progress=lambda x: job.__setitem__("progress", float(x)),
                                       cancel=lambda: job.get("cancel"), only=data.get("only") or None)
            job["status"] = "done"
        except Exception as e:
            job["status"] = "error"
            job["error"] = "Скасовано." if job.get("cancel") else _friendly(e)

    threading.Thread(target=work, daemon=True).start()
    return jsonify({"job": jid})


@app.post("/api/content/cancel/<jid>")
def content_cancel(jid):
    job = PROC_JOBS.get(jid)
    if job:
        job["cancel"] = True
    return jsonify({"ok": True})


@app.post("/api/content/uninstall")
def content_uninstall():
    from .engine import content as CT

    data = request.get_json(force=True) or {}
    try:
        return jsonify(CT.uninstall(str(data.get("pack")), data.get("inst") or None))
    except Exception as e:
        return jsonify({"error": _friendly(e)}), 400


def _sbk_job(fn):
    jid = uuid.uuid4().hex[:10]
    job = {"id": jid, "status": "running", "progress": 0.0, "result": None, "error": None, "cancel": False}
    PROC_JOBS[jid] = job

    def work():
        try:
            fn(job)
            job["status"] = "done"
        except Exception as e:
            job["status"] = "error"
            job["error"] = "Скасовано." if job.get("cancel") else _friendly(e)

    threading.Thread(target=work, daemon=True).start()
    return jsonify({"job": jid})


@app.get("/api/soundbank")
def soundbank_list():
    from .engine import soundbank as SBK

    return jsonify(SBK.listing())


@app.post("/api/soundbank/build")
def soundbank_build():
    from .engine import soundbank as SBK

    return _sbk_job(lambda job: job.__setitem__("result", len(SBK.build_essentials(lambda x: job.__setitem__("progress", float(x))))))


@app.post("/api/soundbank/sonicpi/install")
def soundbank_sonicpi_install():
    from .engine import soundbank as SBK

    return _sbk_job(lambda job: job.__setitem__("result", len(SBK.install_sonicpi(lambda x: job.__setitem__("progress", float(x)), lambda: job.get("cancel")))))


@app.post("/api/soundbank/sonicpi/remove")
def soundbank_sonicpi_remove():
    from .engine import soundbank as SBK

    return jsonify(SBK.remove_sonicpi())


@app.get("/api/soundbank/file")
def soundbank_file():
    from .engine import soundbank as SBK

    f = SBK.path(request.args.get("f", ""))
    if not f:
        abort(404)
    return send_file(f, mimetype="audio/wav", max_age=3600)


@app.get("/api/soundbank/fit")
def soundbank_fit():
    import io

    from .engine import soundbank as SBK

    try:
        data = SBK.fit(request.args.get("f", ""), float(request.args.get("factor", 1)), float(request.args.get("semis", 0)))
    except FileNotFoundError:
        abort(404)
    return send_file(io.BytesIO(data), mimetype="audio/wav")


@app.post("/api/lyrics/stress")
def lyrics_stress():
    from .engine import stress as ST

    data = request.get_json(force=True) or {}
    words = [w for w in (data.get("words") or []) if isinstance(w, str)]
    return jsonify({"available": ST.available(), "stress": ST.lookup(words)})


@app.post("/api/phone/start")
def phone_start():
    import secrets

    from werkzeug.serving import make_server

    if not PHONE["srv"]:
        last = None
        for port in range(47900, 47920):
            try:
                srv = make_server("0.0.0.0", port, _phone_app(), threaded=True)
                break
            except OSError as e:
                last = e
        else:
            return jsonify({"error": _friendly(last)}), 500
        PHONE.update(srv=srv, port=port, token=secrets.token_urlsafe(5), ip=_lan_ip())
        threading.Thread(target=srv.serve_forever, daemon=True).start()
    if not PHONE.get("fw") or PHONE.get("fw") == "declined" and (request.get_json(silent=True) or {}).get("retry_fw"):
        PHONE["fw"] = _firewall()
    return jsonify({"url": f"http://{PHONE['ip']}:{PHONE['port']}/?k={PHONE['token']}", "ip": PHONE["ip"], "port": PHONE["port"],
                    "token": PHONE["token"], "firewall": PHONE.get("fw"), "lan": not PHONE["ip"].startswith("127.")})


@app.post("/api/phone/stop")
def phone_stop():
    if PHONE["srv"]:
        threading.Thread(target=PHONE["srv"].shutdown, daemon=True).start()
    PHONE.update(srv=None, token=None, port=None)
    return jsonify({"ok": True})


@app.get("/api/phone/inbox")
def phone_inbox():
    import json as _json

    out = []
    for f in sorted(_phone_dir().glob("*.json"), reverse=True):
        try:
            out.append(_json.loads(f.read_text(encoding="utf-8")))
        except Exception:
            pass
    return jsonify({"items": out, "on": bool(PHONE["srv"])})


@app.get("/api/phone/file/<name>")
def phone_file(name):
    f = (_phone_dir() / Path(name).name)
    if not f.exists():
        abort(404)
    return send_file(f, max_age=0)


@app.post("/api/phone/delete/<iid>")
def phone_delete(iid):
    for f in _phone_dir().glob(Path(iid).name + "*"):
        f.unlink(missing_ok=True)
    return jsonify({"ok": True})


LIVE_STATE: dict = {"t": 0}


@app.post("/api/live/state")
def live_state_set():
    LIVE_STATE.clear()
    LIVE_STATE.update(request.get_json(force=True) or {})
    LIVE_STATE["t"] = time.time()
    return jsonify({"ok": True})


@app.get("/api/live/state")
def live_state_get():
    return jsonify(LIVE_STATE)


@app.post("/api/album/status")
def album_status():
    from .engine import album as AL

    return jsonify(AL.status((request.get_json(force=True) or {}).get("pids") or []))


@app.post("/api/album/build")
def album_build():
    from .engine import album as AL

    data = request.get_json(force=True) or {}
    jid = uuid.uuid4().hex[:10]
    job = {"id": jid, "status": "running", "progress": 0.0, "result": None, "error": None}
    PROC_JOBS[jid] = job

    def work():
        try:
            job["result"] = AL.build(data.get("pids") or [], data, progress=lambda x: job.__setitem__("progress", float(x)))
            job["status"] = "done"
        except Exception as e:
            job["status"] = "error"
            job["error"] = _friendly(e)
            job["trace"] = traceback.format_exc()[-1500:]

    threading.Thread(target=work, daemon=True).start()
    return jsonify({"job": jid})


@app.post("/api/album/open")
def album_open():
    d = P.workspace() / "_albums"
    p = Path(str((request.get_json(force=True) or {}).get("path") or ""))
    try:
        p = p.resolve()
        if d.resolve() not in p.parents and p != d.resolve():
            abort(403)
    except Exception:
        abort(400)
    _open_folder(p if p.is_dir() else p.parent)
    return jsonify({"ok": True})


@app.get("/api/process/<jid>")
def process_status(jid):
    j = PROC_JOBS.get(jid)
    if not j:
        abort(404)
    return jsonify(j)


@app.get("/api/project/<pid>/versions")
def project_versions(pid):
    return jsonify(PR.Versions(_pdir(pid)).meta)


@app.delete("/api/project/<pid>/version/<vid>")
def project_version_delete(pid, vid):
    PR.Versions(_pdir(pid)).delete(Path(vid).name)
    return jsonify({"ok": True})


@app.get("/api/project/<pid>/vpreview/<vid>")
def project_version_preview(pid, vid):
    f = _pdir(pid) / "versions" / f"{Path(vid).name}_preview.wav"
    if not f.exists():
        abort(404)
    return send_file(f, mimetype="audio/wav", max_age=3600)


@app.get("/api/project/<pid>/full/<sid>")
def project_full_audio(pid, sid):
    d = _pdir(pid)
    sid = Path(sid).name
    f = d / "versions" / f"{sid}.wav"
    if not f.exists():
        f = d / "stems" / f"{sid}.wav"
    if not f.exists():
        abort(404)
    return send_file(f, mimetype="audio/wav", max_age=0)


@app.get("/api/project/<pid>/mix")
def project_mix_get(pid):
    from .engine.jsonio import read_json

    return jsonify(read_json(_pdir(pid) / "mix.json"))


@app.post("/api/project/<pid>/mix")
def project_mix_save(pid):
    d = _pdir(pid)
    from .engine.jsonio import write_json

    write_json(d / "mix.json", request.get_json(force=True), None)
    try:
        X.maybe_auto_snapshot(d)
    except Exception:
        pass
    return jsonify({"ok": True})


@app.post("/api/project/<pid>/render/clear")
def project_render_clear(pid):
    d = _pdir(pid) / "render"
    shutil.rmtree(d, ignore_errors=True)
    d.mkdir(parents=True, exist_ok=True)
    return jsonify({"ok": True})


@app.post("/api/project/<pid>/render")
def project_render_upload(pid):
    d = _pdir(pid) / "render"
    d.mkdir(parents=True, exist_ok=True)
    f = request.files["file"]
    name = P.slugify(request.form.get("name", "render")) + ".wav"
    f.save(d / name)
    return jsonify({"ok": True, "file": name})


def _lufs(y, sr):
    import numpy as np
    from scipy.signal import lfilter

    y = np.atleast_2d(y).astype(np.float64)
    if y.shape[0] == 1:
        y = np.vstack([y, y])
    f0, G, Q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    K = np.tan(np.pi * f0 / sr)
    Vh, Vb = 10 ** (G / 20), (10 ** (G / 20)) ** 0.4996667741545416
    a0 = 1 + K / Q + K * K
    b1 = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0]
    a1 = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
    f0, Q = 38.13547087602444, 0.5003270373238773
    K = np.tan(np.pi * f0 / sr)
    a0 = 1 + K / Q + K * K
    b2, a2 = [1, -2, 1], [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
    z = lfilter(b2, a2, lfilter(b1, a1, y[:2], axis=1), axis=1) ** 2
    blk, hop = int(0.4 * sr), int(0.1 * sr)
    zs = np.array([z[:, s:s + blk].mean(axis=1).sum() for s in range(0, z.shape[1] - blk, hop)])
    if not len(zs):
        return -70.0
    L = lambda v: -0.691 + 10 * np.log10(v + 1e-12)
    g = zs[L(zs) > -70]
    if not len(g):
        return -70.0
    g = g[L(g) > L(g.mean()) - 10]
    return float(L(g.mean()))


@app.post("/api/project/<pid>/reference")
def project_reference_upload(pid):
    from .engine.jsonio import write_json

    d = _pdir(pid)
    f = request.files["file"]
    tmp = d / ("_ref_upload" + Path(f.filename or "ref.wav").suffix)
    f.save(tmp)
    try:
        y, sr = P.load_audio(tmp, 32000)
    finally:
        tmp.unlink(missing_ok=True)
    if y.shape[0] == 1:
        import numpy as np

        y = np.vstack([y, y])
    P.save_wav(d / "reference.wav", y[:2], sr, "PCM_16")
    info = {"name": Path(f.filename or "reference").stem, "lufs": round(_lufs(y, sr), 2), "duration": round(y.shape[1] / sr, 2)}
    write_json(d / "reference.json", info)
    return jsonify(info)


@app.get("/api/project/<pid>/reference")
def project_reference_info(pid):
    from .engine.jsonio import read_json

    return jsonify(read_json(_pdir(pid) / "reference.json") or {})


@app.get("/api/project/<pid>/reference/audio")
def project_reference_audio(pid):
    f = _pdir(pid) / "reference.wav"
    if not f.exists():
        abort(404)
    return send_file(f, mimetype="audio/wav", max_age=0)


@app.get("/api/project/<pid>/kit")
def project_kit(pid):
    _pdir(pid)
    try:
        return jsonify(P.get_kit(pid))
    except Exception as e:
        return jsonify({"error": _friendly(e)}), 500


@app.get("/api/project/<pid>/sample")
def project_sample(pid):
    if request.args.get("f", "").startswith("sb:"):
        from .engine import soundbank as SBK

        f = SBK.path(request.args["f"])
        if not f:
            abort(404)
        return send_file(f, mimetype="audio/wav", max_age=3600)
    if request.args.get("f", "").startswith("pack:"):
        from .engine import content as CT

        f = CT.file_path(request.args["f"])
        if not f:
            abort(404)
        return send_file(f, mimetype="audio/wav", max_age=3600)
    if request.args.get("f", "").startswith("lib:"):
        f = X.sample_path(request.args["f"])
        if not f:
            abort(404)
        return send_file(f, mimetype="audio/wav", max_age=3600)
    d = (_pdir(pid) / "samples").resolve()
    f = (d / request.args.get("f", "")).resolve()
    if d not in f.parents or not f.exists():
        abort(404)
    return send_file(f, mimetype="audio/wav", max_age=3600)


@app.get("/api/project/<pid>/guide")
def project_guide(pid):
    d = _pdir(pid)
    g = sorted((d / "export").rglob("*.html")) if (d / "export").exists() else []
    if not g:
        P.export(pid)
        g = sorted((d / "export").rglob("*.html"))
    if request.args.get("lang") == "en":
        from .engine import i18n as I18

        try:
            pj = P.load_project(pid)
            keep = I18.keep_names(pj, P.build(pid).get("tracks")) + [P.slugify(pj.get("title") or "")]
        except Exception:
            keep = []
        html = I18.tr_html(g[0].read_text(encoding="utf-8"), keep).replace('lang="uk"', 'lang="en"')
        return app.response_class(html, mimetype="text/html")
    return send_file(g[0], mimetype="text/html", max_age=0)


@app.get("/api/project/<pid>/mixdown/<fmt>")
def project_mixdown(pid, fmt):
    d = _pdir(pid)
    ex = d / "export"
    hits = sorted(ex.rglob(f"* - mix.{Path(fmt).name}")) if ex.exists() else []
    if not hits:
        abort(404)
    return send_file(hits[0], as_attachment=True, download_name=hits[0].name)


@app.get("/api/project/<pid>/midi")
def project_midi(pid):
    d = _pdir(pid)
    ex = d / "export"
    mids = sorted(ex.rglob("* - all tracks.mid")) if ex.exists() else []
    if not mids:
        P.export(pid)
        mids = sorted(ex.rglob("* - all tracks.mid"))
    return send_file(mids[0], as_attachment=True, download_name=mids[0].name)


@app.get("/api/library")
def library_get():
    return jsonify(X.library())


@app.post("/api/library/sample")
def library_sample_add():
    out, errs = [], []
    tmp = P.workspace() / "_uploads" / ("lib-" + uuid.uuid4().hex[:8])
    tmp.mkdir(parents=True, exist_ok=True)
    try:
        for f in request.files.getlist("files"):
            name = Path(f.filename or "sample.wav").name
            dest = tmp / name
            f.save(dest)
            try:
                out.append(X.add_sample(dest, Path(name).stem))
            except Exception as e:
                errs.append(f"{name}: {_friendly(e)}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return jsonify({"added": out, "errors": errs, "library": X.library()})


@app.post("/api/library/analyze")
def library_analyze():
    try:
        return jsonify(X.analyze_library())
    except Exception as e:
        return jsonify({"error": _friendly(e)}), 500


@app.get("/api/library/fit")
def library_fit():
    import io

    try:
        data = X.fit_sample(request.args.get("f", ""), float(request.args.get("factor", 1) or 1), float(request.args.get("semis", 0) or 0))
    except FileNotFoundError:
        abort(404)
    except Exception as e:
        return jsonify({"error": _friendly(e)}), 500
    return send_file(io.BytesIO(data), mimetype="audio/wav", max_age=0)


@app.get("/api/library/sample/<path:name>")
def library_sample_get(name):
    f = X.sample_path("lib:" + Path(name).name)
    if not f:
        abort(404)
    return send_file(f, mimetype="audio/wav", max_age=3600)


@app.delete("/api/library/sample/<path:name>")
def library_sample_del(name):
    X.delete_sample(Path(name).name)
    return jsonify(X.library())


@app.post("/api/library/preset")
def library_preset_save():
    j = request.get_json(force=True)
    if not (j.get("name") or "").strip() or j.get("kind") not in ("synth", "fx", "chain", "template"):
        return jsonify({"error": "Потрібна назва пресету."}), 400
    X.save_preset(j["kind"], j["name"], j.get("data"))
    return jsonify(X.library())


@app.post("/api/library/preset/delete")
def library_preset_del():
    j = request.get_json(force=True)
    X.delete_preset(j.get("kind", ""), j.get("name", ""))
    return jsonify(X.library())


@app.get("/api/project/<pid>/snapshots")
def snapshots_list(pid):
    return jsonify(X.snapshots(_pdir(pid)))


@app.post("/api/project/<pid>/snapshots")
def snapshots_add(pid):
    j = request.get_json(force=True) or {}
    r = X.snapshot(_pdir(pid), (j.get("label") or "").strip() or "Знімок")
    if not r:
        return jsonify({"error": "Ще немає змін, які можна зберегти."}), 400
    return jsonify(r)


@app.post("/api/project/<pid>/snapshots/<sid>/restore")
def snapshots_restore(pid, sid):
    if not X.restore_snapshot(_pdir(pid), sid):
        abort(404)
    P.build(pid)
    return jsonify({"ok": True})


@app.delete("/api/project/<pid>/snapshots/<sid>")
def snapshots_del(pid, sid):
    X.delete_snapshot(_pdir(pid), sid)
    return jsonify({"ok": True})


@app.post("/api/project/<pid>/video")
def project_video(pid):
    d = _pdir(pid)
    f = request.files["file"]
    form = request.form
    tmpd = d / "cache" / "video_upload"
    tmpd.mkdir(parents=True, exist_ok=True)
    vc = form.get("vcodec", "")
    suf = {"h264": ".h264", "ivf": ".ivf"}.get(vc) or (".mp4" if "mp4" in (f.mimetype or "") or (f.filename or "").endswith(".mp4") else ".webm")
    tag = uuid.uuid4().hex[:8]
    src = tmpd / (tag + suf)
    f.save(src)
    af = None
    if request.files.get("audio"):
        af = tmpd / (tag + "_a.wav")
        request.files["audio"].save(af)
    num = lambda k, dv=0.0: float(form.get(k) or dv)

    def fn(prog):
        try:
            return VID.finish(pid, src, form.get("title") or "InkBeat", form.get("label") or "video", form.get("audio", "video"), af,
                              num("audio_start"), num("lead"), num("duration"), int(num("fps", 30)),
                              form.get("fade_in", "1") == "1", form.get("fade_out", "1") == "1", vc, prog)
        finally:
            src.unlink(missing_ok=True)
            if af is not None:
                af.unlink(missing_ok=True)

    return _job_thread(fn)


@app.post("/api/project/<pid>/cover")
def project_cover_upload(pid):
    d = _pdir(pid)
    f = request.files["file"]
    tmp = d / "cache" / ("cover-" + uuid.uuid4().hex[:6])
    f.save(tmp)
    try:
        return jsonify(VID.save_cover(Path(d).name, tmp))
    except Exception:
        return jsonify({"error": "Не вдалося відкрити зображення. Підійде JPG або PNG."}), 400
    finally:
        tmp.unlink(missing_ok=True)


@app.get("/api/project/<pid>/cover")
def project_cover_get(pid):
    f = VID.cover_path(Path(_pdir(pid)).name)
    if not f.exists():
        abort(404)
    return send_file(f, max_age=0)


@app.delete("/api/project/<pid>/cover")
def project_cover_del(pid):
    VID.cover_path(Path(_pdir(pid)).name).unlink(missing_ok=True)
    return jsonify({"ok": True})


@app.get("/api/project/<pid>/video/file/<name>")
def project_video_file(pid, name):
    f = VID.out_dir(Path(_pdir(pid)).name) / Path(name).name
    if not f.exists():
        abort(404)
    return send_file(f, conditional=True)


@app.post("/api/project/<pid>/video/open")
def project_video_open(pid):
    _open_folder(VID.out_dir(Path(_pdir(pid)).name))
    return jsonify({"ok": True})


@app.get("/api/video/support")
def video_support():
    return jsonify({"ffmpeg": bool(VID.ffmpeg_exe())})


@app.get("/api/localfile")
def local_file():
    pth = Path(request.args.get("path", ""))
    ok = {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aif", ".aiff", ".opus", ".jpg", ".jpeg", ".png", ".webp", ".zip"}
    if request.remote_addr not in ("127.0.0.1", "::1") or pth.suffix.lower() not in ok or not pth.is_file():
        abort(404)
    return send_file(pth, conditional=True)


@app.get("/api/localdir")
def local_dir():
    d = Path(request.args.get("path", ""))
    if request.remote_addr not in ("127.0.0.1", "::1") or not d.is_dir():
        abort(404)
    ok = {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aif", ".aiff", ".opus"}
    files = []
    for f in sorted(d.rglob("*")):
        if len(f.relative_to(d).parts) <= 3 and f.is_file() and f.suffix.lower() in ok and not f.name.startswith("."):
            files.append(str(f))
        if len(files) >= 64:
            break
    return jsonify({"files": files})


@app.post("/api/projects/new")
def projects_new():
    j = request.get_json(force=True, silent=True) or {}
    try:
        pid = X.create_empty(j.get("title", ""), float(j.get("bpm") or 120), int(j.get("bpb") or 4),
                             int(j.get("tonic") or 0), j.get("mode", "major"), int(j.get("bars") or 64))
    except Exception as e:
        return jsonify({"error": _friendly(e)}), 500
    return jsonify({"pid": pid})


@app.post("/api/project/<pid>/record")
def project_record(pid):
    d = _pdir(pid)
    f = request.files["file"]
    tmpd = d / "cache" / "rec_upload"
    tmpd.mkdir(parents=True, exist_ok=True)
    suf = Path(f.filename or "take.wav").suffix.lower()
    src = tmpd / (uuid.uuid4().hex[:8] + (suf if suf in (".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aif", ".aiff", ".opus") else ".wav"))
    f.save(src)
    form = request.form
    jid = uuid.uuid4().hex[:10]
    job = {"id": jid, "status": "running", "progress": 0.0, "result": None, "error": None}
    PROC_JOBS[jid] = job

    def work():
        try:
            job["result"] = X.add_recording(pid, src, float(form.get("start", 0)), form.get("name", ""),
                                            form.get("kind", "vocals"), form.get("transcribe", "1") == "1",
                                            progress=lambda x: job.__setitem__("progress", float(x)))
            job["status"] = "done"
        except Exception as e:
            job["status"] = "error"
            job["error"] = _friendly(e)
            job["trace"] = traceback.format_exc()[-1500:]
        finally:
            src.unlink(missing_ok=True)

    threading.Thread(target=work, daemon=True).start()
    return jsonify({"job": jid})


@app.delete("/api/project/<pid>/track/<tid>")
def project_track_delete(pid, tid):
    _pdir(pid)
    if not X.delete_recording(pid, tid):
        return jsonify({"error": "Видаляти можна лише власні записи."}), 400
    return jsonify({"ok": True})


@app.post("/api/project/<pid>/transform")
def project_transform(pid):
    _pdir(pid)
    j = request.get_json(force=True) or {}
    job = P.Job(id=uuid.uuid4().hex[:10], inputs=[], mode="stems", model="6", title=None,
                transform={"pid": pid, "bpm": j.get("bpm"), "semis": int(j.get("semis", 0)),
                           "key_name": j.get("key_name"), "use_edits": bool(j.get("use_edits", True))})
    JOBS[job.id] = job
    job.say("У черзі…")
    QUEUE.put(job)
    return jsonify({"job_id": job.id})


@app.post("/api/project/<pid>/pitchmap")
def project_pitchmap(pid):
    from .engine import vocal as VO

    d = _pdir(pid)
    data = request.get_json(force=True) or {}
    V = PR.Versions(d)
    src = V.path(data.get("source")) if data.get("source") else d / "stems" / f"{data['base']}.wav"
    if not src.exists():
        abort(404)
    jid = uuid.uuid4().hex[:10]
    job = {"id": jid, "status": "running", "progress": 0.0, "result": None, "error": None}
    PROC_JOBS[jid] = job

    def work():
        try:
            job["result"] = VO.pitch_map(d, src, progress=lambda f: job.__setitem__("progress", float(f)))
            job["status"] = "done"
        except Exception as e:
            job["status"] = "error"
            job["error"] = _friendly(e)
            job["trace"] = traceback.format_exc()[-1500:]

    threading.Thread(target=work, daemon=True).start()
    return jsonify({"job": jid})


@app.post("/api/report")
def make_report():
    j = request.get_json(force=True) or {}
    jobs = [x.public() for x in JOBS.values()] + [{k: v for k, v in x.items() if k != "result"} for x in PROC_JOBS.values()]
    dest = CARE.report(j.get("ui_errors") or [], jobs, j.get("note", ""))
    try:
        _open_folder(dest.parent)
    except Exception:
        pass
    return jsonify({"path": str(dest)})


def _job_thread(fn):
    jid = uuid.uuid4().hex[:10]
    job = {"id": jid, "status": "running", "progress": 0.0, "result": None, "error": None}
    PROC_JOBS[jid] = job

    def work():
        try:
            job["result"] = fn(lambda f: job.__setitem__("progress", float(f)))
            job["status"] = "done"
        except Exception as e:
            job["status"] = "error"
            job["error"] = _friendly(e) if not isinstance(e, (ValueError, RuntimeError)) else str(e)
            job["trace"] = traceback.format_exc()[-1500:]

    threading.Thread(target=work, daemon=True).start()
    return jsonify({"job": jid})


def _incoming_file(kind):
    if request.files.get("file"):
        f = request.files["file"]
        tmpd = P.workspace() / "_uploads"
        tmpd.mkdir(parents=True, exist_ok=True)
        dest = tmpd / f"{kind}-{uuid.uuid4().hex[:8]}.zip"
        f.save(dest)
        return dest, True
    j = request.get_json(force=True, silent=True) or {}
    pth = Path(j.get("path", ""))
    if not pth.is_file():
        abort(400)
    return pth, False


@app.get("/api/update/info")
def update_info():
    return jsonify({"current": P.VERSION, "prefs": UPD.prefs(), "repo": UPD.source()["repo"], "platform": sys.platform})


@app.post("/api/update/check")
def update_check():
    j = request.get_json(force=True, silent=True) or {}
    return jsonify(UPD.check(force=bool(j.get("force"))))


@app.post("/api/update/prefs")
def update_prefs():
    j = request.get_json(force=True, silent=True) or {}
    p = UPD.save_prefs(j)
    return jsonify({"prefs": p, "repo": UPD.source()["repo"]})


@app.post("/api/update/install")
def update_install():
    return _job_thread(UPD.install)


@app.post("/api/update")
def update_app():
    src, tmp = _incoming_file("upd")

    def fn(prog):
        try:
            return CARE.update_from_zip(src, prog)
        finally:
            if tmp:
                src.unlink(missing_ok=True)

    return _job_thread(fn)


@app.get("/api/project/<pid>/archive")
def project_archive(pid):
    d = _pdir(pid)
    p = P.load_project(pid)
    tmpd = P.workspace() / "_uploads"
    tmpd.mkdir(parents=True, exist_ok=True)
    for old in tmpd.glob("arc-*.zip"):
        old.unlink(missing_ok=True)
    dest = tmpd / f"arc-{uuid.uuid4().hex[:6]}.zip"
    CARE.archive(d.name, dest)
    return send_file(dest, as_attachment=True, download_name=f"{P.slugify(p['title'])}.inkbeat.zip", mimetype="application/zip")


@app.post("/api/projects/import")
def projects_import():
    src, tmp = _incoming_file("imp")

    def fn(prog):
        try:
            pid = CARE.import_archive(src)
            P.build(pid)
            return {"pid": pid}
        finally:
            if tmp:
                src.unlink(missing_ok=True)

    return _job_thread(fn)


@app.post("/api/project/<pid>/duplicate")
def project_duplicate(pid):
    d = _pdir(pid)
    j = request.get_json(force=True, silent=True) or {}
    npid = CARE.duplicate(d.name, j.get("title"))
    P.build(npid)
    return jsonify({"pid": npid})



@app.get("/api/vst")
def vst_list():
    from .engine import vst as VST

    return jsonify(VST.plugins())


@app.post("/api/vst/scan")
def vst_scan():
    from .engine import vst as VST

    force = bool((request.get_json(force=True, silent=True) or {}).get("force"))
    return _job_thread(lambda prog: VST.scan(prog, force))


@app.post("/api/vst/folders")
def vst_folders():
    from .engine import vst as VST

    j = request.get_json(force=True) or {}
    c = VST.config()
    f = (j.get("folder") or "").strip()
    if j.get("remove"):
        c["folders"] = [x for x in c["folders"] if x != f]
    elif f and f not in c["folders"]:
        if not Path(f).exists():
            return jsonify({"error": "Папку не знайдено."}), 400
        c["folders"].append(f)
    VST.save_config(c)
    return jsonify(VST.plugins())


@app.post("/api/vst/edit")
def vst_edit():
    from .engine import vst as VST

    j = request.get_json(force=True) or {}
    return _job_thread(lambda prog: VST.edit(j["path"], j.get("name"), j.get("state")))


@app.post("/api/project/<pid>/vstrender")
def vst_render(pid):
    from .engine import vst as VST

    d = _pdir(pid)
    j = request.get_json(force=True) or {}

    def fn(prog):
        import soundfile as sf

        prog(0.1)
        notes = [n for n in j.get("notes", []) if n[0] + n[1] > 0]
        shift = min([0.0] + [n[0] for n in notes])
        notes = [[n[0] - shift, n[1], n[2], n[3]] for n in notes]
        y = VST.render_notes(j["path"], j.get("name"), j.get("state"), notes, float(j.get("duration", 60)) - shift)
        prog(0.7)
        tmpf = d / "cache" / f"vst_{uuid.uuid4().hex[:6]}.wav"
        sf.write(str(tmpf), y.T, 44100, subtype="FLOAT")
        try:
            return X.add_recording(pid, tmpf, shift, j.get("track_name") or "VST", j.get("kind") or "other", False)
        finally:
            tmpf.unlink(missing_ok=True)

    return _job_thread(fn)
