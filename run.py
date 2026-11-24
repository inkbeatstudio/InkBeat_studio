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


def desktop_window(url, server_mod):
    if sys.platform != "win32" or "--browser" in sys.argv or "--edge" in sys.argv:
        return False
    try:
        import webview
    except Exception:
        return False
    api = DesktopApi()
    store = Path.home() / ".inkbeat" / "webview"
    store.mkdir(parents=True, exist_ok=True)
    try:
        webview.settings["ALLOW_DOWNLOADS"] = True
    except Exception:
        pass
    win = webview.create_window("InkBeat", url, js_api=api, width=1500, height=920, min_size=(1100, 680),
                                background_color="#0c0d11", maximized=True, zoomable=True)
    api.window = win

    def on_closing():
        if server_mod.busy():
            return win.create_confirmation_dialog("InkBeat", "Зараз іде розбір або обробка. Закрити програму і перервати роботу?")
        return True

    win.events.closing += on_closing
    icon = ROOT / "app" / "ui" / "inkbeat.ico"
    try:
        webview.start(private_mode=False, storage_path=str(store), icon=str(icon))
    except TypeError:
        webview.start(private_mode=False, storage_path=str(store))
    return True


def main():
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
        srv = threading.Thread(target=lambda: app.run(host="127.0.0.1", port=port, threaded=True, debug=False,
                                                      use_reloader=False), daemon=True)
        srv.start()
        for _ in range(100):
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                    break
            except OSError:
                time.sleep(0.1)
        if desktop_window(url, server_mod):
            os._exit(0)
        open_window(url)
        srv.join()
        return
    app.run(host="127.0.0.1", port=port, threaded=True, debug=False, use_reloader=False)


if __name__ == "__main__":
    main()
