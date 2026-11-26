import hashlib
import os
import re
import sys
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get("OUT", REPO / "dist"))
ITEMS = ["app", "run.py", "requirements.txt", "update.json", "fl_scripts", "installer", "ПРОЧИТАЙ МЕНЕ.txt", "THIRD_PARTY_NOTICES.txt"]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / "InkBeat-update.zip"
    files = []
    for it in ITEMS:
        p = REPO / it
        if p.is_file():
            files.append(p)
        elif p.is_dir():
            files += [f for f in sorted(p.rglob("*")) if f.is_file() and "__pycache__" not in f.parts and f.suffix != ".pyc"]
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
        for f in files:
            zi = zipfile.ZipInfo.from_file(f, "InkBeat/" + f.relative_to(REPO).as_posix())
            zi.flag_bits |= 0x800
            zi.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(zi, f.read_bytes())
    h = hashlib.sha256(dest.read_bytes()).hexdigest()
    (OUT / "InkBeat-update.zip.sha256").write_text(f"{h}  InkBeat-update.zip\n", encoding="utf-8")
    print(dest, len(files), h)


if __name__ == "__main__":
    main()
