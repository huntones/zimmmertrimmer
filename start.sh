#!/usr/bin/env bash
# macOS / Linux launcher
cd "$(dirname "$0")"
( sleep 1; command -v xdg-open >/dev/null && xdg-open http://localhost:7000/index.html || open http://localhost:7000/index.html ) &
python3 -m http.server 7000
