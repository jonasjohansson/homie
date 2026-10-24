#!/usr/bin/env bash
# release.sh — build Homie for download: Developer ID signed by scripts/sign.mjs (notarized
# and stapled when the "homie-notary" keychain profile exists), zipped per architecture into
# dist/, and attached to a GitHub release. Usage: scripts/release.sh [arm64|x64|all]
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
want="${1:-all}"; [ "$want" = all ] && archs="arm64 x64" || archs="$want"
version=$(node -p "require('./package.json').version")
say() { printf '  %-9s %s\n' "$1" "$2"; }

mkdir -p dist
for arch in $archs; do
  rm -rf "out/Homie-darwin-$arch"
  npx electron-forge package --arch "$arch" >/dev/null
  app="out/Homie-darwin-$arch/Homie.app"
  node scripts/sign.mjs "$app"
  zip="dist/Homie-mac-$arch.zip"; rm -f "$zip"
  ditto -c -k --keepParent "$app" "$zip"
  say zipped "$zip ($(du -h "$zip" | cut -f1))"
done

# GitHub release: one per version, assets replaced when rerun. The 130 MB uploads time out
# now and then (HTTP 408), so each is retried on its own.
gh release view "v$version" >/dev/null 2>&1 || gh release create "v$version" --title "Homie $version" --notes "Signed and notarized macOS builds. Unzip, move Homie to Applications, open it." >/dev/null
for arch in $archs; do
  for try in 1 2 3; do gh release upload "v$version" "dist/Homie-mac-$arch.zip" --clobber >/dev/null 2>&1 && break; say retry "upload of Homie-mac-$arch.zip ($try)"; sleep 5; done
done
say released "https://github.com/jonasjohansson/homie/releases/tag/v$version"
