#!/usr/bin/env bash
# build-app.sh — build Homie.app into build/ (release, arm64, ad-hoc signed).
set -euo pipefail
cd "$(dirname "$0")/.."
# Keep the output quiet, but fail on a compile error: the old `| grep || true` hid
# errors, and the stale binary in .build then got installed as if it were new.
filter() { grep -vE '^\[|Compiling|Build complete|warning: .*Yams' || true; }
if ! out=$(swift build -c release --arch arm64 2>&1); then
  printf '%s\n' "$out" | filter; echo "build failed"; exit 1
fi
printf '%s\n' "$out" | filter
bin=$(swift build -c release --arch arm64 --show-bin-path)/Homie
[ -x "$bin" ] || { echo "build failed"; exit 1; }
app=build/Homie.app
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$bin" "$app/Contents/MacOS/Homie"
cp Resources/Info.plist "$app/Contents/"
cp Resources/icon.icns Resources/trayIcon.png Resources/trayIcon@2x.png \
   Resources/trayIconUnread.png Resources/trayIconUnread@2x.png "$app/Contents/Resources/"
printf 'APPL????' > "$app/Contents/PkgInfo"
codesign --force --deep --sign - "$app" 2>/dev/null
echo "built $app"
