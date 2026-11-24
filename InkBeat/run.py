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


def main():
    from app.server import app

    port = free_port()
    url = f"http://127.0.0.1:{port}/"
    print("=" * 60)
    print("  INKBEAT — Song → FL Studio")
    print(f"  Інтерфейс: {url}")
    print("  Не закривайте це вікно, поки працюєте з програмою.")
    print("=" * 60)
    if "--no-window" not in sys.argv:
        threading.Timer(1.2, open_window, args=(url,)).start()
    import logging

    logging.getLogger("werkzeug").setLevel(logging.WARNING)
    app.run(host="127.0.0.1", port=port, threaded=True, debug=False, use_reloader=False)


if __name__ == "__main__":
    main()
