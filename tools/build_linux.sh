#!/bin/bash
set -e
source "$(dirname "$0")/payload.sh"
B="$(mktemp -d)"
mkdir -p "$B/InkBeat/installer" "$OUT"
payload "$B/InkBeat"
cp "$REPO/installer/bootstrap.sh" "$B/InkBeat/installer/"
chmod +x "$B/InkBeat/installer/bootstrap.sh"
tar -C "$B" -czf "$B/payload.tgz" InkBeat
cat > "$B/head.sh" <<'HEAD'
#!/bin/bash
echo "Розпаковую інсталятор InkBeat…"
TMPD="$(mktemp -d)"
trap 'rm -rf "$TMPD"' EXIT
LINE=$(awk '/^__PAYLOAD_BELOW__$/{print NR + 1; exit 0}' "$0")
tail -n +"$LINE" "$0" | tar -xz -C "$TMPD" || { echo "Файл інсталятора пошкоджений. Завантажте його ще раз."; exit 1; }
bash "$TMPD/InkBeat/installer/bootstrap.sh" "$@"
CODE=$?
if [ $CODE -eq 0 ] && [ -z "${INKBEAT_NO_LAUNCH:-}" ] && { [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; }; then
  nohup "$HOME/.local/bin/inkbeat" >/dev/null 2>&1 &
fi
exit $CODE
__PAYLOAD_BELOW__
HEAD
cat "$B/head.sh" "$B/payload.tgz" > "$OUT/InkBeat-Setup-Linux.run"
chmod +x "$OUT/InkBeat-Setup-Linux.run"
rm -rf "$B"
echo "Linux: $OUT/InkBeat-Setup-Linux.run"
