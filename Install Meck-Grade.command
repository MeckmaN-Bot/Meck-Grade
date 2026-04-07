#!/usr/bin/env bash
# Meck-Grade — macOS Installer (Doppelklick in Finder)
# Startet den grafischen Installer. Benötigt Python 3.9+.
cd "$(dirname "$0")"

PYTHON=""
for cmd in python3.13 python3.12 python3.11 python3.10 python3.9 python3 python; do
  if command -v "$cmd" &>/dev/null; then
    major=$("$cmd" -c "import sys; print(sys.version_info.major)" 2>/dev/null)
    minor=$("$cmd" -c "import sys; print(sys.version_info.minor)" 2>/dev/null)
    if [[ "$major" -eq 3 && "$minor" -ge 9 ]]; then
      PYTHON="$cmd"; break
    fi
  fi
done

if [[ -z "$PYTHON" ]]; then
  osascript -e 'display alert "Python 3.9+ wird benötigt." message "Bitte installiere Python von https://www.python.org/downloads/ und versuche es erneut." as critical'
  exit 1
fi

"$PYTHON" installer_gui.py
