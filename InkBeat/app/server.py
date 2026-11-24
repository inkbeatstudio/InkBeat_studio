from __future__ import annotations

import os
import queue
import shutil
import subprocess
import sys
import threading
import traceback
import uuid
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_file, send_from_directory

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
        try:
            P.analyze(job)
        except P.Cancelled:
            job.status = "cancelled"
            job.say("Скасовано.")
        except Exception as e:
            job.status = "error"
            job.error = _friendly(e)
            job.say("ПОМИЛКА: " + job.error)
            job.say(traceback.format_exc()[-1500:])


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

        info["device"] = "cuda" if torch.cuda.is_available() else "cpu"
        if info["device"] == "cuda":
            info["gpu"] = torch.cuda.get_device_name(0)
        import demucs

        info["separator"] = True
    except Exception:
        pass
    return jsonify(info)


def _start(inputs, form):
    job = P.Job(id=uuid.uuid4().hex[:10], inputs=[str(i) for i in inputs], mode=form.get("mode", "auto"),
                model=form.get("model", "6"), title=(form.get("title") or "").strip() or None)
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
    return _start(paths, data)


@app.get("/api/job/<jid>")
def job_status(jid):
    j = JOBS.get(jid)
    if not j:
        abort(404)
    return jsonify(j.public())


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


@app.get("/api/project/<pid>/kit")
def project_kit(pid):
    _pdir(pid)
    try:
        return jsonify(P.get_kit(pid))
    except Exception as e:
        return jsonify({"error": _friendly(e)}), 500


@app.get("/api/project/<pid>/sample")
def project_sample(pid):
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
    return send_file(g[0], mimetype="text/html", max_age=0)


@app.get("/api/project/<pid>/midi")
def project_midi(pid):
    d = _pdir(pid)
    ex = d / "export"
    mids = sorted(ex.rglob("* - all tracks.mid")) if ex.exists() else []
    if not mids:
        P.export(pid)
        mids = sorted(ex.rglob("* - all tracks.mid"))
    return send_file(mids[0], as_attachment=True, download_name=mids[0].name)
