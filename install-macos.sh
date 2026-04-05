#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Meck-Grade — macOS Installer
#
# Was passiert:
#  1. Python 3.9+ prüfen / via Homebrew installieren
#  2. Tesseract OCR via Homebrew installieren (optional, für Karten-OCR)
#  3. Python-venv erstellen + alle Abhängigkeiten installieren
#  4. PyInstaller-Build → dist/Meck-Grade.app
#  5. Meck-Grade.app → /Applications/ kopieren
#  6. Desktop-Alias erstellen
#
# Ergebnis: eigenständige App ohne Browser — Doppelklick genügt.
#
# Verwendung:
#   bash install-macos.sh
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="Meck-Grade"
MIN_PYTHON_MINOR=9

green() { echo -e "\033[32m$*\033[0m"; }
yellow(){ echo -e "\033[33m$*\033[0m"; }
red()   { echo -e "\033[31m$*\033[0m"; }

green "═══════════════════════════════════════════"
green " Meck-Grade macOS Installer"
green "═══════════════════════════════════════════"
echo ""

# ── 1. Python prüfen ──────────────────────────────────────────────────────────
PYTHON=""
for cmd in python3 python3.13 python3.12 python3.11 python3.10 python3.9; do
  if command -v "$cmd" &>/dev/null; then
    minor=$("$cmd" -c "import sys; print(sys.version_info.minor)")
    major=$("$cmd" -c "import sys; print(sys.version_info.major)")
    if [[ "$major" -eq 3 && "$minor" -ge "$MIN_PYTHON_MINOR" ]]; then
      PYTHON="$cmd"; break
    fi
  fi
done

if [[ -z "$PYTHON" ]]; then
  yellow "Python 3.${MIN_PYTHON_MINOR}+ nicht gefunden."
  if command -v brew &>/dev/null; then
    yellow "Installiere Python 3 via Homebrew…"
    brew install python3
    PYTHON="python3"
  else
    red "Fehler: Python 3.${MIN_PYTHON_MINOR}+ wird benötigt."
    red "Installiere es von https://www.python.org/downloads/ oder via Homebrew."
    exit 1
  fi
fi
green "✓ Python: $($PYTHON --version)"

# ── 2. Tesseract (optional, für Karten-OCR) ───────────────────────────────────
if ! command -v tesseract &>/dev/null; then
  if command -v brew &>/dev/null; then
    yellow "Installiere Tesseract OCR via Homebrew (optional)…"
    brew install tesseract || yellow "Tesseract-Installation fehlgeschlagen — Karten-OCR wird deaktiviert."
  else
    yellow "Tesseract nicht gefunden — Karten-OCR deaktiviert. Installiere mit: brew install tesseract"
  fi
else
  green "✓ Tesseract: $(tesseract --version 2>&1 | head -1)"
fi

# ── 3. Venv erstellen + Abhängigkeiten installieren ───────────────────────────
VENV="${REPO_DIR}/.venv"
echo ""
echo "Erstelle Python-Umgebung…"
"$PYTHON" -m venv "$VENV"
green "✓ Virtuelle Umgebung: .venv/"

echo "Installiere Abhängigkeiten (kann etwas dauern)…"
"$VENV/bin/pip" install --upgrade pip -q
"$VENV/bin/pip" install -r "${REPO_DIR}/requirements-desktop.txt" -q
green "✓ Alle Pakete installiert"

# ── 4. PyInstaller-Build ──────────────────────────────────────────────────────
echo ""
echo "Baue Meck-Grade.app (PyInstaller)…"
cd "$REPO_DIR"
mkdir -p hooks

# Alten Build aufräumen
rm -rf dist/Meck-Grade.app dist/Meck-Grade build/Meck-Grade

"$VENV/bin/pyinstaller" MeckGrade.spec --noconfirm --clean

if [[ ! -d "${REPO_DIR}/dist/Meck-Grade.app" ]]; then
  red "Build fehlgeschlagen — prüfe die PyInstaller-Ausgabe oben."
  exit 1
fi
green "✓ dist/Meck-Grade.app erstellt"

# ── 5. Nach /Applications/ kopieren ──────────────────────────────────────────
echo ""
echo "Kopiere nach /Applications/…"
APP_DEST="/Applications/${APP_NAME}.app"
rm -rf "$APP_DEST"
cp -R "${REPO_DIR}/dist/${APP_NAME}.app" "$APP_DEST"
green "✓ /Applications/Meck-Grade.app installiert"

# ── 6. Desktop-Alias erstellen ────────────────────────────────────────────────
osascript -e \
  "tell application \"Finder\" to make alias file to POSIX file \"${APP_DEST}\" at POSIX file \"$HOME/Desktop\"" \
  2>/dev/null || ln -sf "$APP_DEST" "$HOME/Desktop/${APP_NAME}"
green "✓ Desktop-Alias erstellt"

# ── Fertig ────────────────────────────────────────────────────────────────────
echo ""
green "════════════════════════════════════════════"
green " Installation abgeschlossen!"
green ""
green " Doppelklicke auf Meck-Grade im Dock oder"
green " auf dem Desktop — kein Browser öffnet sich."
green ""
green " Beim ersten Start: Rechtsklick → Öffnen"
green " (macOS Gatekeeper, nur einmalig nötig)."
green "════════════════════════════════════════════"
