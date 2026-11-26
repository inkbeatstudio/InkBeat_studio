#!/bin/bash
set -e
source "$(dirname "$0")/payload.sh"
B="$(mktemp -d)"
APP="$B/InkBeat.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/InkBeat/installer" "$OUT"
payload "$APP/Contents/Resources/InkBeat"
cp "$REPO/installer/bootstrap.sh" "$APP/Contents/Resources/InkBeat/installer/"
python3 - "$REPO/app/ui/inkbeat.png" "$APP/Contents/Resources/inkbeat.icns" <<'PY'
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGBA")
side = max(im.size)
canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
canvas.resize((1024, 1024), Image.LANCZOS).save(sys.argv[2], sizes=[(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512), (1024, 1024)])
PY
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>InkBeat</string>
  <key>CFBundleDisplayName</key><string>InkBeat</string>
  <key>CFBundleIdentifier</key><string>studio.inkbeat.app</string>
  <key>CFBundleExecutable</key><string>InkBeat</string>
  <key>CFBundleIconFile</key><string>inkbeat</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VER</string>
  <key>CFBundleVersion</key><string>$VER</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSMicrophoneUsageDescription</key><string>InkBeat використовує мікрофон для запису вокалу у вокальній студії.</string>
</dict>
</plist>
PLIST
cat > "$APP/Contents/MacOS/InkBeat" <<'LAUNCH'
#!/bin/bash
RES="$(cd "$(dirname "$0")/../Resources" && pwd)"
DEST="$HOME/Library/Application Support/InkBeat"
PY="$DEST/runtime/bin/python3"
ver() { sed -n 's/^VERSION = "\(.*\)"/\1/p' "$1/app/engine/project.py" 2>/dev/null | head -n 1; }
newer() { [ "$(printf '%s\n%s\n' "$1" "$2" | sort -t. -k1,1n -k2,2n -k3,3n | tail -n 1)" = "$1" ] && [ "$1" != "$2" ]; }
NEED=0
[ -f "$DEST/runtime/installed.ok" ] || NEED=1
if [ $NEED = 0 ] && newer "$(ver "$RES/InkBeat")" "$(ver "$DEST")"; then NEED=1; fi
if [ $NEED = 1 ]; then
  osascript -e 'tell application "Terminal" to activate' -e "tell application \"Terminal\" to do script \"clear; bash '$RES/install.sh'\"" >/dev/null 2>&1
  exit 0
fi
cd "$DEST" && exec "$PY" "$DEST/run.py" --auto-exit
LAUNCH
cat > "$APP/Contents/Resources/install.sh" <<'INST'
#!/bin/bash
RES="$(cd "$(dirname "$0")" && pwd)"
APP="$(cd "$RES/../.." && pwd)"
printf '\033]0;Встановлення InkBeat\007'
bash "$RES/InkBeat/installer/bootstrap.sh"
CODE=$?
if [ $CODE -eq 0 ]; then
  open "$APP"
  echo "Це вікно можна закрити."
else
  read -r -p "Натисніть Enter, щоб закрити…" _
fi
exit $CODE
INST
chmod +x "$APP/Contents/MacOS/InkBeat" "$APP/Contents/Resources/install.sh" "$APP/Contents/Resources/InkBeat/installer/bootstrap.sh"
python3 - "$B" "$OUT/InkBeat-macOS.zip" <<'PY'
import os, sys, zipfile
root, dest = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
    for d, dirs, files in os.walk(root):
        dirs.sort()
        rel = os.path.relpath(d, root)
        if rel != ".":
            zi = zipfile.ZipInfo(rel + "/")
            zi.external_attr = (0o40755 << 16) | 0x10
            zi.create_system = 3
            z.writestr(zi, "")
        for f in sorted(files):
            p = os.path.join(d, f)
            r = os.path.relpath(p, root)
            zi = zipfile.ZipInfo.from_file(p, r)
            zi.create_system = 3
            zi.flag_bits |= 0x800
            zi.external_attr = (os.stat(p).st_mode & 0xFFFF) << 16
            zi.compress_type = zipfile.ZIP_DEFLATED
            with open(p, "rb") as fh:
                z.writestr(zi, fh.read())
PY
rm -rf "$B"
echo "macOS: $OUT/InkBeat-macOS.zip"
