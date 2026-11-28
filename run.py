import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

if sys.stdout is None or sys.stderr is None or "pythonw" in Path(sys.executable).name.lower():
    _logdir = Path.home() / ".inkbeat"
    _logdir.mkdir(parents=True, exist_ok=True)
    _log = open(_logdir / "inkbeat.log", "a", encoding="utf-8", buffering=1)
    sys.stdout = _log
    sys.stderr = _log


def running_instance(port=47800):
    import json
    import urllib.request

    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/system", timeout=1.5) as r:
            return "separator" in json.loads(r.read().decode("utf-8"))
    except Exception:
        return False


def watchdog(server_mod, idle=150):
    while True:
        time.sleep(10)
        last = server_mod._PING["t"]
        if last and time.time() - last > idle and not server_mod.busy():
            os._exit(0)


def free_port(preferred=47800):
    for port in [preferred] + list(range(preferred + 1, preferred + 50)):
        with socket.socket() as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return 0


def find_app_browser():
    cands = []
    if sys.platform.startswith("win"):
        for base in (os.environ.get("PROGRAMFILES(X86)", ""), os.environ.get("PROGRAMFILES", ""),
                     os.environ.get("LOCALAPPDATA", "")):
            if base:
                cands += [Path(base) / "Microsoft/Edge/Application/msedge.exe",
                          Path(base) / "Google/Chrome/Application/chrome.exe"]
    elif sys.platform == "darwin":
        cands += [Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
                  Path("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge")]
    else:
        for n in ("google-chrome", "chromium", "chromium-browser", "microsoft-edge"):
            p = shutil.which(n)
            if p:
                cands.append(Path(p))
    for c in cands:
        if c.exists():
            return str(c)
    return None


def open_window(url):
    exe = find_app_browser()
    if exe and "--browser" not in sys.argv:
        try:
            profile = Path.home() / ".inkbeat" / "window"
            profile.mkdir(parents=True, exist_ok=True)
            subprocess.Popen([exe, f"--app={url}", "--window-size=1500,920", f"--user-data-dir={profile}",
                              "--no-first-run", "--no-default-browser-check"])
            return
        except Exception:
            pass
    webbrowser.open(url)


def log_line(text):
    try:
        d = Path.home() / ".inkbeat"
        d.mkdir(parents=True, exist_ok=True)
        with open(d / "inkbeat.log", "a", encoding="utf-8") as fh:
            fh.write(time.strftime("%Y-%m-%d %H:%M:%S ") + str(text) + "\n")
    except Exception:
        pass


class DesktopApi:
    def __init__(self):
        self._window = None
        self._restart = False
        self._force = False

    def _dialog(self, kind, multiple=False, types=()):
        import webview

        fd = getattr(webview, "FileDialog", None)
        legacy = {"OPEN": "OPEN_DIALOG", "FOLDER": "FOLDER_DIALOG", "SAVE": "SAVE_DIALOG"}[kind]
        code = getattr(fd, kind, None) if fd is not None else None
        if code is None:
            code = getattr(webview, legacy, {"OPEN": 10, "FOLDER": 20, "SAVE": 30}[kind])
        attempts = [dict(allow_multiple=multiple, file_types=types), dict(allow_multiple=multiple), {}]
        last = None
        for kw in attempts:
            try:
                r = self._window.create_file_dialog(code, **kw)
                break
            except Exception as e:
                last = e
                r = None
        else:
            log_line("file dialog failed: " + repr(last))
            raise RuntimeError("Не вдалося відкрити вікно вибору файлів")
        if not r:
            return []
        return [str(x) for x in (r if isinstance(r, (list, tuple)) else [r])]

    def open_window(self, path="ui/second.html", title="InkBeat"):
        import webview

        base = getattr(self, "_base", "")
        if not base:
            return False
        url = base + str(path).lstrip("/")
        common = dict(background_color="#0c0d11", zoomable=True)
        try:
            screens = list(getattr(webview, "screens", []) or [])
        except Exception:
            screens = []
        other = screens[1] if len(screens) > 1 else None
        tries = []
        if other is not None:
            tries.append(dict(screen=other, fullscreen=True))
            sx, sy = getattr(other, "x", None), getattr(other, "y", None)
            if sx is not None and sy is not None:
                tries.append(dict(x=int(sx) + 40, y=int(sy) + 40, width=max(800, int(other.width) - 80),
                                  height=max(600, int(other.height) - 80)))
        tries.append(dict(width=1100, height=700))
        for i, extra in enumerate(tries):
            try:
                self._second = webview.create_window(str(title), url, js_api=self, **common, **extra)
                return "second" if other is not None and i < len(tries) - 1 else "one"
            except Exception as e:
                log_line("second window attempt failed: " + repr(e))
        return False

    def close_second(self):
        w = getattr(self, "_second", None)
        self._second = None
        if w is None:
            return False
        try:
            w.destroy()
            return True
        except Exception:
            return False

    def open_audio(self, multiple=True):
        return self._dialog("OPEN", bool(multiple), ("Аудіо (*.wav;*.mp3;*.flac;*.ogg;*.m4a;*.aif;*.aiff;*.opus)", "Усі файли (*.*)"))

    def open_files(self, kind="audio", multiple=False):
        types = {
            "audio": ("Аудіо (*.wav;*.mp3;*.flac;*.ogg;*.m4a;*.aif;*.aiff;*.opus)", "Усі файли (*.*)"),
            "image": ("Зображення (*.jpg;*.jpeg;*.png;*.webp)", "Усі файли (*.*)"),
            "media": ("Зображення і відео (*.jpg;*.jpeg;*.png;*.webp;*.gif;*.mp4;*.webm;*.mov;*.m4v)", "Усі файли (*.*)"),
            "font": ("Шрифти (*.ttf;*.otf;*.woff;*.woff2)", "Усі файли (*.*)"),
            "zip": ("Архів (*.zip)", "Усі файли (*.*)"),
            "inkbeat": ("Архів InkBeat (*.inkbeat;*.zip)", "Усі файли (*.*)"),
            "soundfont": ("SoundFont / SFZ (*.sf2;*.sfz;*.zip)", "Усі файли (*.*)"),
        }.get(kind, ("Усі файли (*.*)",))
        return self._dialog("OPEN", bool(multiple), types)

    def open_folder(self):
        return self._dialog("FOLDER")

    def open_zip(self):
        return self._dialog("OPEN", False, ("Архів (*.zip)", "Усі файли (*.*)"))

    def force_close(self):
        self._force = True
        self._window.destroy()
        return True

    def restart(self):
        self._restart = True
        self._force = True
        self._window.destroy()
        return True

    def fullscreen(self):
        self._window.toggle_fullscreen()
        return True

    def info(self):
        return {"desktop": True}

    def open_url(self, url):
        import webbrowser

        if str(url).startswith("https://"):
            webbrowser.open(url)
        return True


SPLASH = """<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#0c0d11;color:#e9ebf1;font-family:'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;user-select:none;cursor:default}
.b{display:flex;flex-direction:column;align-items:center;gap:16px;width:420px}.t{letter-spacing:.3em;font-weight:700;font-size:20px}
.bar{width:100%;height:4px;background:#242833;border-radius:2px;overflow:hidden;position:relative}
.bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#e0952a,#ffb547);border-radius:2px;transition:width .25s linear}
.bar b{position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.18),transparent);width:30%;animation:g 1.6s ease-in-out infinite}
@keyframes g{0%{margin-left:-30%}100%{margin-left:100%}}
.row{display:flex;justify-content:space-between;width:100%;font-size:12px;color:#8b91a3;font-variant-numeric:tabular-nums}
.s{color:#c9cdd8;font-size:14px;text-align:center;min-height:20px}.h{color:#8b91a3;font-size:12.5px;text-align:center;line-height:1.55;min-height:40px;opacity:0;transition:opacity .6s}
.pulse{animation:p 2.4s ease-in-out infinite}@keyframes p{50%{opacity:.75}}</style></head><body><div class="b">
<svg class="pulse" viewBox="0 0 32 32" width="64" height="64"><rect width="32" height="32" rx="7" fill="#1b1e26"/><g fill="#ffb547"><rect x="6" y="12" width="3" height="8" rx="1.5"/><rect x="11" y="7" width="3" height="18" rx="1.5"/><rect x="16" y="10" width="3" height="12" rx="1.5"/></g><g fill="#4fd1c5"><rect x="21" y="9" width="6" height="3" rx="1"/><rect x="21" y="15" width="4" height="3" rx="1"/><rect x="21" y="21" width="6" height="3" rx="1"/></g></svg>
<div class="t">INKBEAT</div><div class="s" id="m">Запускаю програму…</div><div class="bar"><i id="f"></i><b></b></div>
<div class="row"><span id="pc">0%</span><span id="tm">0:00</span></div><div class="h" id="h">Перший запуск після встановлення довший: Windows один раз перевіряє нові файли програми. Наступні запуски займатимуть кілька секунд.</div></div>
<script>
var cur=0,target=3,t0=Date.now(),f=document.getElementById('f'),pc=document.getElementById('pc'),tm=document.getElementById('tm'),h=document.getElementById('h');
function stage(p,t){if(p>target)target=p;if(t)document.getElementById('m').textContent=t;}
setInterval(function(){var cap=target>=100?100:Math.min(99,target+9);if(cur<target)cur+=Math.max(.6,(target-cur)*.25);else cur+=(cap-cur)*.006;if(cur>cap)cur=cap;
f.style.width=cur.toFixed(1)+'%';pc.textContent=Math.floor(cur)+'%';var e=Math.floor((Date.now()-t0)/1000);tm.textContent=Math.floor(e/60)+':'+('0'+e%60).slice(-2);if(e>=12)h.style.opacity=1;},100);
</script></body></html>"""

FAIL = """<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#0c0d11;color:#e9ebf1;font-family:'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center}
div{max-width:560px;line-height:1.6}code{color:#ffb547}</style></head><body><div><h2>Не вдалося запустити рушій InkBeat</h2>
<p>Найчастіше допомагає просто запустити InkBeat ще раз.</p><p>Якщо ні — відкрийте ярлик <code>Діагностика InkBeat</code> у меню «Пуск» — у вікні повідомлень буде видно причину. Журнал: <code>{LOG}</code></p><p>Якщо не допомагає, запустіть інсталятор InkBeat-Setup ще раз: він відновить програму, проєкти залишаться.</p></div></body></html>"""


def boot_stage(p, text):
    path = os.environ.get("INKBEAT_BOOT")
    if not path:
        return
    try:
        import json

        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump({"p": p, "t": text}, fh, ensure_ascii=False)
        os.replace(tmp, path)
    except Exception:
        pass


def warm_engine():
    try:
        boot_stage(70, "Готую обчислювальний рушій…")
        import torch

        boot_stage(86, "Перевіряю відеокарту…")
        torch.cuda.is_available()
        boot_stage(93, "Завантажую модуль розділення доріжок…")
        import demucs.pretrained
    except Exception as e:
        print("warm-up:", e)
    boot_stage(100, "Відкриваю студію…")


def server_main(port):
    import logging

    if "--no-update" not in sys.argv:
        boot_stage(3, "Перевіряю оновлення…")
        try:
            from app.engine import updater

            updater.startup(lambda text: boot_stage(5, text))
        except Exception:
            pass
    boot_stage(8, "Завантажую математичні модулі…")
    import numpy
    import scipy.signal

    boot_stage(24, "Завантажую модулі аналізу звуку…")
    import librosa

    boot_stage(46, "Готую інтерфейс студії…")
    from app import server as server_mod
    from app.server import app

    boot_stage(62, "Запускаю рушій…")
    threading.Thread(target=watchdog, args=(server_mod,), daemon=True).start()
    threading.Thread(target=warm_engine, daemon=True).start()
    logging.getLogger("werkzeug").setLevel(logging.WARNING)
    app.run(host="127.0.0.1", port=port, threaded=True, debug=False, use_reloader=False)


def dark_titlebar(seconds=15):
    try:
        import ctypes
        from ctypes import wintypes

        user32, dwm = ctypes.windll.user32, ctypes.windll.dwmapi
        pid = os.getpid()
        done = set()
        proc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

        def each(hwnd, _):
            owner = wintypes.DWORD()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(owner))
            if owner.value == pid and hwnd not in done and user32.IsWindowVisible(hwnd) and user32.GetWindowTextLengthW(hwnd) > 0:
                for attr, val in ((20, 1), (19, 1), (35, 0x00110D0C), (36, 0x00F1EBE9), (34, 0x00332824)):
                    v = ctypes.c_int(val)
                    dwm.DwmSetWindowAttribute(wintypes.HWND(hwnd), attr, ctypes.byref(v), ctypes.sizeof(v))
                user32.SetWindowPos(wintypes.HWND(hwnd), None, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0004 | 0x0010 | 0x0020)
                done.add(hwnd)
            return True

        cb = proc(each)
        end = time.time() + seconds
        while time.time() < end:
            user32.EnumWindows(cb, 0)
            time.sleep(0.05 if not done else 0.5)
    except Exception as e:
        print("titlebar:", e)


def desktop_main():
    if "--browser" in sys.argv or "--edge" in sys.argv or sys.platform not in ("win32", "darwin", "linux"):
        return False
    try:
        import webview

        if sys.platform == "linux":
            import subprocess as _sp

            probe = "import sys; from PyQt6.QtWidgets import QApplication; from PyQt6 import QtWebEngineWidgets; QApplication(sys.argv)"
            if _sp.run([sys.executable, "-c", probe], capture_output=True, timeout=20).returncode != 0:
                return False
    except Exception:
        return False
    import json
    import subprocess
    import urllib.request

    logdir = Path.home() / ".inkbeat"
    logdir.mkdir(parents=True, exist_ok=True)
    child = None
    bootfile = str(logdir / "boot-none.json")
    if running_instance():
        port = 47800
    else:
        port = free_port()
        bootfile = str(logdir / f"boot-{port}.json")
        try:
            os.remove(bootfile)
        except OSError:
            pass
        os.environ["INKBEAT_BOOT"] = bootfile
        quiet = sys.stdout is None or "pythonw" in Path(sys.executable).name.lower() or getattr(sys.stdout, "name", "") != "<stdout>"
        out = open(logdir / "server.log", "a", encoding="utf-8") if quiet else None
        child = subprocess.Popen([sys.executable, str(ROOT / "run.py"), "--server", str(port)], cwd=str(ROOT),
                                 stdout=out, stderr=out, creationflags=0x08000000 if quiet else 0)
    url = f"http://127.0.0.1:{port}/"
    api = DesktopApi()
    store = logdir / "webview"
    store.mkdir(parents=True, exist_ok=True)
    try:
        webview.settings["ALLOW_DOWNLOADS"] = True
    except Exception:
        pass
    win = webview.create_window("InkBeat", html=SPLASH, js_api=api, width=1500, height=920, min_size=(1100, 680),
                                background_color="#0c0d11", maximized=True, zoomable=True)
    api._window = win
    api._base = url

    def show(p, text):
        try:
            win.evaluate_js("window.stage && stage(%d, %s)" % (p, json.dumps(text, ensure_ascii=False)))
        except Exception:
            pass

    def ping():
        try:
            with urllib.request.urlopen(url + "api/ping", data=b"", timeout=2) as r:
                return r.status == 200
        except Exception:
            return False

    def boot():
        threading.Thread(target=dark_titlebar, daemon=True).start()
        last, alive_since, start = None, None, time.time()
        while True:
            if child is not None and child.poll() is not None:
                win.load_html(FAIL.replace("{LOG}", str(logdir / "server.log")))
                return
            st = None
            try:
                st = json.loads(Path(bootfile).read_text(encoding="utf-8"))
            except Exception:
                pass
            if st and (st.get("p"), st.get("t")) != last:
                last = (st.get("p"), st.get("t"))
                show(int(st.get("p") or 0), st.get("t") or "")
            if ping():
                alive_since = alive_since or time.time()
                if child is None or (st and int(st.get("p") or 0) >= 100) or time.time() - alive_since > 240:
                    break
            elif time.time() - start > 900:
                win.load_html(FAIL.replace("{LOG}", str(logdir / "server.log")))
                return
            time.sleep(0.25)
        show(100, "Відкриваю студію…")
        time.sleep(0.35)
        win.load_url(url)

    def busy():
        try:
            with urllib.request.urlopen(url + "api/busy", timeout=1.5) as r:
                return bool(json.loads(r.read().decode("utf-8")).get("busy"))
        except Exception:
            return False

    def on_closing():
        if api._force or not busy():
            return True
        threading.Thread(target=lambda: win.evaluate_js("window.inkbeatAskClose ? inkbeatAskClose() : pywebview.api.force_close()"), daemon=True).start()
        return False

    win.events.closing += on_closing
    icon = ROOT / "app" / "ui" / ("inkbeat.ico" if sys.platform == "win32" else "inkbeat.png")
    extra = {"gui": "qt"} if sys.platform == "linux" else {}
    try:
        webview.start(boot, private_mode=False, storage_path=str(store), icon=str(icon), **extra)
    except TypeError:
        webview.start(boot, private_mode=False, storage_path=str(store), **extra)
    if child is not None:
        try:
            child.terminate()
            child.wait(timeout=5)
        except Exception:
            try:
                child.kill()
            except Exception:
                pass
    if api._restart:
        subprocess.Popen([sys.executable, str(ROOT / "run.py")], cwd=str(ROOT))
    return True


def main():
    if "--server" in sys.argv:
        server_main(int(sys.argv[sys.argv.index("--server") + 1]))
        return
    if "--no-window" not in sys.argv and desktop_main():
        os._exit(0)
    if "--no-window" not in sys.argv and running_instance():
        open_window("http://127.0.0.1:47800/")
        return
    from app import server as server_mod
    from app.server import app

    if "--auto-exit" in sys.argv:
        threading.Thread(target=watchdog, args=(server_mod,), daemon=True).start()
    port = free_port()
    url = f"http://127.0.0.1:{port}/"
    print("=" * 60)
    print("  INKBEAT — music studio")
    print(f"  Інтерфейс: {url}")
    print("  Не закривайте це вікно, поки працюєте з програмою.")
    print("=" * 60)
    import logging

    logging.getLogger("werkzeug").setLevel(logging.WARNING)
    if "--no-window" not in sys.argv:
        threading.Timer(1.2, open_window, args=(url,)).start()
    app.run(host="127.0.0.1", port=port, threaded=True, debug=False, use_reloader=False)


if __name__ == "__main__":
    main()
