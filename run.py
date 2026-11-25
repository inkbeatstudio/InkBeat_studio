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


class DesktopApi:
    def __init__(self):
        self.window = None

    def _dialog(self, kind, multiple=False, types=()):
        import webview

        fd = getattr(webview, "FileDialog", None)
        code = getattr(fd, kind) if fd else {"OPEN": 10, "FOLDER": 20, "SAVE": 30}[kind]
        r = self.window.create_file_dialog(code, allow_multiple=multiple, file_types=types)
        if not r:
            return []
        return [str(x) for x in (r if isinstance(r, (list, tuple)) else [r])]

    def open_audio(self, multiple=True):
        return self._dialog("OPEN", bool(multiple), ("Аудіо (*.wav;*.mp3;*.flac;*.ogg;*.m4a;*.aif;*.aiff)", "Усі файли (*.*)"))

    def open_folder(self):
        return self._dialog("FOLDER")

    def fullscreen(self):
        self.window.toggle_fullscreen()
        return True

    def info(self):
        return {"desktop": True}


SPLASH = """<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#0c0d11;color:#e9ebf1;font-family:'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center}
.b{display:flex;flex-direction:column;align-items:center;gap:18px}.t{letter-spacing:.3em;font-weight:700;font-size:20px}
.s{color:#8b91a3;font-size:13px}.bar{width:220px;height:3px;background:#242833;border-radius:2px;overflow:hidden}
.bar i{display:block;width:40%;height:100%;background:#ffb547;animation:m 1.2s ease-in-out infinite}
@keyframes m{0%{margin-left:-40%}100%{margin-left:100%}}</style></head><body><div class="b">
<svg viewBox="0 0 32 32" width="64" height="64"><rect width="32" height="32" rx="7" fill="#1b1e26"/><g fill="#ffb547"><rect x="6" y="12" width="3" height="8" rx="1.5"/><rect x="11" y="7" width="3" height="18" rx="1.5"/><rect x="16" y="10" width="3" height="12" rx="1.5"/></g><g fill="#4fd1c5"><rect x="21" y="9" width="6" height="3" rx="1"/><rect x="21" y="15" width="4" height="3" rx="1"/><rect x="21" y="21" width="6" height="3" rx="1"/></g></svg>
<div class="t">INKBEAT</div><div class="bar"><i></i></div><div class="s" id="m">Запуск… Перший запуск після встановлення може тривати до хвилини.</div></div></body></html>"""

FAIL = """<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#0c0d11;color:#e9ebf1;font-family:'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center}
div{max-width:560px;line-height:1.6}code{color:#ffb547}</style></head><body><div><h2>Не вдалося запустити рушій InkBeat</h2>
<p>Запустіть <code>2_ЗАПУСТИТИ (Windows).bat</code> — у чорному вікні буде видно причину. Журнал: <code>{LOG}</code></p></div></body></html>"""


def server_main(port):
    import logging

    from app import server as server_mod
    from app.server import app

    threading.Thread(target=watchdog, args=(server_mod,), daemon=True).start()
    logging.getLogger("werkzeug").setLevel(logging.WARNING)
    app.run(host="127.0.0.1", port=port, threaded=True, debug=False, use_reloader=False)


def desktop_main():
    if sys.platform != "win32" or "--browser" in sys.argv or "--edge" in sys.argv:
        return False
    try:
        import webview
    except Exception:
        return False
    import json
    import subprocess
    import urllib.request

    logdir = Path.home() / ".inkbeat"
    logdir.mkdir(parents=True, exist_ok=True)
    child = None
    if running_instance():
        port = 47800
    else:
        port = free_port()
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
    api.window = win

    def boot():
        for _ in range(1800):
            if child is not None and child.poll() is not None:
                win.load_html(FAIL.replace("{LOG}", str(logdir / "server.log")))
                return
            try:
                with urllib.request.urlopen(url + "api/ping", data=b"", timeout=1) as r:
                    if r.status == 200:
                        break
            except Exception:
                time.sleep(0.1)
        win.load_url(url)

    def busy():
        try:
            with urllib.request.urlopen(url + "api/busy", timeout=1.5) as r:
                return bool(json.loads(r.read().decode("utf-8")).get("busy"))
        except Exception:
            return False

    def on_closing():
        if busy():
            return win.create_confirmation_dialog("InkBeat", "Зараз іде розбір або обробка. Закрити програму і перервати роботу?")
        return True

    win.events.closing += on_closing
    icon = ROOT / "app" / "ui" / "inkbeat.ico"
    try:
        webview.start(boot, private_mode=False, storage_path=str(store), icon=str(icon))
    except TypeError:
        webview.start(boot, private_mode=False, storage_path=str(store))
    if child is not None:
        try:
            child.terminate()
            child.wait(timeout=5)
        except Exception:
            try:
                child.kill()
            except Exception:
                pass
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
    print("  INKBEAT — Song → FL Studio")
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
