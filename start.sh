#!/usr/bin/env bash
# Linux launcher for the web app
set -e

cd "$(dirname "$0")"
PORT=7000
URL="http://localhost:${PORT}/index.html"

if command -v xdg-open >/dev/null 2>&1; then
  (sleep 1; xdg-open "$URL" >/dev/null 2>&1) &
elif command -v gio >/dev/null 2>&1; then
  (sleep 1; gio open "$URL" >/dev/null 2>&1) &
elif command -v sensible-browser >/dev/null 2>&1; then
  (sleep 1; sensible-browser "$URL" >/dev/null 2>&1) &
elif command -v x-www-browser >/dev/null 2>&1; then
  (sleep 1; x-www-browser "$URL" >/dev/null 2>&1) &
else
  echo "Open this URL in your browser: $URL"
fi

python3 -m http.server "$PORT"
