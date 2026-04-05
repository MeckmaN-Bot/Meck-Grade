#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Meck-Grade — macOS Desktop-App Build
# Erstellt dist/Meck-Grade.app via PyInstaller.
#
# Voraussetzungen:
#   - Python-venv aktiv oder requirements-desktop.txt installiert
#   - macOS mit Xcode Command Line Tools
#
# Verwendung:
#   bash build-macos.sh
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO"

green() { echo -e "\033[32m$*\033[0m"; }
yellow(){ echo -e "\033[33m$*\033[0m"; }

# Venv aktivieren falls vorhanden
if [[ -f ".venv/bin/activate" ]]; then
  source .venv/bin/activate
  green "✓ venv aktiviert"
fi

# Desktop-Abhängigkeiten installieren (pywebview, pyinstaller)
green "Installiere Desktop-Abhängigkeiten…"
pip install -r requirements-desktop.txt -q
green "✓ Abhängigkeiten OK"

# Hooks-Verzeichnis erstellen (kann leer bleiben)
mkdir -p hooks

# Alten Build aufräumen
rm -rf dist/Meck-Grade.app dist/Meck-Grade build/Meck-Grade

# Build
green "Starte PyInstaller Build…"
pyinstaller MeckGrade.spec --noconfirm --clean

if [[ -d "dist/Meck-Grade.app" ]]; then
  green ""
  green "════════════════════════════════════════"
  green " ✓  dist/Meck-Grade.app wurde erstellt!"
  green ""
  green " Zum Testen:"
  green "   open dist/Meck-Grade.app"
  green ""
  green " Nach /Applications kopieren:"
  green "   cp -R dist/Meck-Grade.app /Applications/"
  green "════════════════════════════════════════"
else
  echo "Build fehlgeschlagen — prüfe die PyInstaller-Ausgabe oben."
  exit 1
fi
