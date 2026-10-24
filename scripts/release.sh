#!/usr/bin/env bash
# release.sh — build Homie for download: Developer ID signed by scripts/sign.mjs (notarized
# and stapled when the "homie-notary" keychain profile exists), zipped per architecture into
# dist/, pushed to itch.io with butler, and attached to a GitHub release. Usage: scripts/release.sh [arm64|x64|all]
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
want="${1:-all}"; [ "$want" = all ] && archs="arm64 x64" || archs="$want"
# butler needs a TTY to log in; an API key from https://itch.io/user/settings/api-keys works
# everywhere. It lives in skynet/.secrets.env as BUTLER_API_KEY, like the other tokens.
skynet="${SKYNET:-$(cd .. && pwd)/skynet}"
[ -f "$skynet/.secrets.env" ] && set -a && . "$skynet/.secrets.env" && set +a
version=$(node -p "require('./package.json').version")
target="${ITCH_TARGET:-jonasjohansson/homie}"
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

if [ -n "${BUTLER_API_KEY:-}" ] && command -v butler >/dev/null && butler status "$target" >/dev/null 2>&1; then
  for arch in $archs; do butler push "dist/Homie-mac-$arch.zip" "$target:mac-$arch" --userversion "$version"; done
  say pushed "itch: https://jonasjohansson.itch.io/homie"
else
  say note "no BUTLER_API_KEY in $skynet/.secrets.env (or no access to $target): zips built, nothing pushed"
fi

# GitHub release: one per version, assets replaced when rerun. The 130 MB uploads time out
# now and then (HTTP 408), so each is retried on its own.
gh release view "v$version" >/dev/null 2>&1 || gh release create "v$version" --title "Homie $version" --notes "Signed and notarized macOS builds. Unzip, move Homie to Applications, open it." >/dev/null
for arch in $archs; do
  for try in 1 2 3; do gh release upload "v$version" "dist/Homie-mac-$arch.zip" --clobber >/dev/null 2>&1 && break; say retry "upload of Homie-mac-$arch.zip ($try)"; sleep 5; done
done
say released "https://github.com/jonasjohansson/homie/releases/tag/v$version"
