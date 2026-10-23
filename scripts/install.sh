#!/usr/bin/env bash
# install.sh — build Homie, put it in ~/Applications, link the shared bookmarks,
# add it to Login Items. Idempotent; --check reports without changing anything.
#
# Called by skynet/config/install.sh on every Mac, so a new machine gets Homie
# with the rest of the shared config.
set -euo pipefail
cd "$(dirname "$0")/.."
CHECK=0; [ "${1:-}" = --check ] && CHECK=1
say() { printf '  %-7s %s\n' "$1" "$2"; }

app="$HOME/Applications/Homie.app"
cfg_dst="$HOME/Library/Application Support/Homie/bookmarks.yml"
skynet="${SKYNET:-$(cd .. && pwd)/skynet}"
cfg_src="$skynet/config/homie/bookmarks.yml"
drift=0

# --- the shared bookmarks file --------------------------------------------------
if [ -f "$cfg_src" ]; then
  if [ -L "$cfg_dst" ] && [ "$(readlink "$cfg_dst")" = "$cfg_src" ]; then
    say ok "$cfg_dst"
  elif [ $CHECK = 1 ]; then
    say DRIFT "$cfg_dst is not linked to $cfg_src"; drift=1
  else
    mkdir -p "$(dirname "$cfg_dst")"
    [ -e "$cfg_dst" ] && [ ! -L "$cfg_dst" ] && mv "$cfg_dst" "$cfg_dst.backup.$(date +%Y%m%d-%H%M%S)"
    rm -f "$cfg_dst"; ln -s "$cfg_src" "$cfg_dst"
    say linked "$cfg_dst -> $cfg_src"
  fi
else
  say missing "$cfg_src (no skynet checkout beside this repo; Homie writes a starter file)"
fi

# --- the app: rebuild when any source is newer than the installed binary ----------
newest=$(find Sources Resources Package.swift -type f -newer "$app/Contents/MacOS/Homie" 2>/dev/null | head -1 || true)
if [ -x "$app/Contents/MacOS/Homie" ] && [ -z "$newest" ]; then
  say ok "$app"
elif [ $CHECK = 1 ]; then
  say DRIFT "$app is missing or older than the source"; drift=1
else
  scripts/build-app.sh
  running=0; pgrep -xq Homie && running=1
  [ $running = 1 ] && osascript -e 'tell application "Homie" to quit' >/dev/null 2>&1 && sleep 1
  mkdir -p "$HOME/Applications"
  rm -rf "$app"; ditto build/Homie.app "$app"
  say built "$app"
  [ $running = 1 ] && open "$app"
fi

# --- login item -------------------------------------------------------------------
if osascript -e 'tell application "System Events" to get the name of every login item' 2>/dev/null | grep -qw Homie; then
  say ok "login item"
elif [ $CHECK = 1 ]; then
  say DRIFT "Homie is not a login item"; drift=1
else
  osascript -e "tell application \"System Events\" to make login item at end with properties {path:\"$app\", hidden:false}" >/dev/null
  say added "login item"
fi

exit $drift
