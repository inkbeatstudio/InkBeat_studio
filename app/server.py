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

        info["device"] = "cuda" if torch.cuda.is_available() else "cpu"
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
    if not (j.get("name") or "").strip() or j.get("kind") not in ("synth", "fx", "chain"):
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


@app.post("/api/project/<pid>/record")
def project_record(pid):
    d = _pdir(pid)
    f = request.files["file"]
    tmpd = d / "cache" / "rec_upload"
    tmpd.mkdir(parents=True, exist_ok=True)
    src = tmpd / (uuid.uuid4().hex[:8] + ".wav")
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
