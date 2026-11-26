import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


def main():
    ver = sys.argv[1]
    text = (REPO / "CHANGELOG.md").read_text(encoding="utf-8") if (REPO / "CHANGELOG.md").exists() else ""
    m = re.search(rf"^##\s*\[?v?{re.escape(ver)}\]?[^\n]*\n(.*?)(?=^##\s|\Z)", text, re.S | re.M)
    body = m.group(1).strip() if m else f"InkBeat {ver}"
    body += "\n\n---\n**Завантажити:** Windows — `InkBeat-Setup-Windows.exe`, macOS — `InkBeat-macOS.zip`, Linux — `InkBeat-Setup-Linux.run`.\nВстановлені програми оновляться самі."
    print(body)


if __name__ == "__main__":
    main()
