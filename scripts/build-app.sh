#!/usr/bin/env bash
# build-app.sh — build Homie.app into build/ (release, arm64, ad-hoc signed).
set -euo pipefail
cd "$(dirname "$0")/.."
swift build -c release --arch arm64 2>&1 | grep -vE '^\[|Compiling|Build complete|warning: .*Yams' || true
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
