#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Meck-Grade — macOS Installer
# Creates a Python venv, installs dependencies, and builds a .app bundle.
# Usage: bash install-macos.sh
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="Meck-Grade"
APP_BUNDLE="/Applications/${APP_NAME}.app"
VENV_DIR="${REPO_DIR}/.venv"
MIN_PYTHON_MINOR=9

# ── Colour helpers ─────────────────────────────────────────────────────────────
green() { echo -e "\033[32m$*\033[0m"; }
yellow(){ echo -e "\033[33m$*\033[0m"; }
red()   { echo -e "\033[31m$*\033[0m"; }

green "═══════════════════════════════════════════"
green " Meck-Grade macOS Installer"
green "═══════════════════════════════════════════"

# ── 1. Check Python ────────────────────────────────────────────────────────────
PYTHON=""
for cmd in python3 python3.12 python3.11 python3.10 python3.9; do
  if command -v "$cmd" &>/dev/null; then
    version=$("$cmd" -c "import sys; print(sys.version_info.minor)")
    major=$("$cmd" -c "import sys; print(sys.version_info.major)")
    if [[ "$major" -eq 3 && "$version" -ge "$MIN_PYTHON_MINOR" ]]; then
      PYTHON="$cmd"
      break
    fi
  fi
done

if [[ -z "$PYTHON" ]]; then
  yellow "Python 3.${MIN_PYTHON_MINOR}+ not found."
  if command -v brew &>/dev/null; then
    yellow "Installing Python via Homebrew…"
    brew install python3
    PYTHON="python3"
  else
    red "Error: Python 3.${MIN_PYTHON_MINOR}+ is required."
    red "Install from https://www.python.org/downloads/ or via Homebrew."
    exit 1
  fi
fi
green "✓ Python: $($PYTHON --version)"

# ── 2. Install Tesseract (optional, for OCR) ───────────────────────────────────
if ! command -v tesseract &>/dev/null; then
  if command -v brew &>/dev/null; then
    yellow "Installing Tesseract OCR via Homebrew (optional — improves card ID)…"
    brew install tesseract || yellow "Tesseract install failed — card name OCR will be disabled."
  else
    yellow "Tesseract not found. Card name OCR will be disabled. Install manually: brew install tesseract"
  fi
else
  green "✓ Tesseract: $(tesseract --version 2>&1 | head -1)"
fi

# ── 3. Create virtual environment ─────────────────────────────────────────────
echo ""
echo "Creating Python virtual environment…"
"$PYTHON" -m venv "$VENV_DIR"
green "✓ venv created at .venv/"

# ── 4. Install Python dependencies ────────────────────────────────────────────
echo "Installing Python packages (this may take a minute)…"
"$VENV_DIR/bin/pip" install --upgrade pip --quiet
"$VENV_DIR/bin/pip" install -r "${REPO_DIR}/requirements.txt" --quiet
green "✓ Python packages installed"

# ── 5. Create data / uploads directories ──────────────────────────────────────
mkdir -p "${REPO_DIR}/data" "${REPO_DIR}/uploads"
green "✓ Data directories ready"

# ── 6. Build .app bundle ──────────────────────────────────────────────────────
echo ""
echo "Building ${APP_NAME}.app…"

CONTENTS="${APP_BUNDLE}/Contents"
MACOS="${CONTENTS}/MacOS"
RESOURCES="${CONTENTS}/Resources"

mkdir -p "$MACOS" "$RESOURCES"

# Launcher script inside .app
cat > "${MACOS}/${APP_NAME}" << LAUNCHER
#!/usr/bin/env bash
REPO="${REPO_DIR}"
cd "\$REPO"
source ".venv/bin/activate"
python run.py
LAUNCHER
chmod +x "${MACOS}/${APP_NAME}"

# Info.plist
cat > "${CONTENTS}/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>              <string>${APP_NAME}</string>
  <key>CFBundleIdentifier</key>        <string>de.meckman.meck-grade</string>
  <key>CFBundleVersion</key>           <string>1.4.0</string>
  <key>CFBundleShortVersionString</key><string>1.4.0</string>
  <key>CFBundleExecutable</key>        <string>${APP_NAME}</string>
  <key>CFBundlePackageType</key>       <string>APPL</string>
  <key>LSUIElement</key>               <false/>
  <key>NSHighResolutionCapable</key>   <true/>
</dict>
</plist>
PLIST

green "✓ ${APP_NAME}.app created in /Applications/"
echo ""

# ── 7. Create Desktop alias ───────────────────────────────────────────────────
DESKTOP_ALIAS=~/Desktop/"${APP_NAME}"
if [[ ! -e "$DESKTOP_ALIAS" ]]; then
  osascript -e "tell application \"Finder\" to make alias file to POSIX file \"${APP_BUNDLE}\" at POSIX file \"$HOME/Desktop\"" 2>/dev/null \
    || ln -sf "$APP_BUNDLE" "$DESKTOP_ALIAS"
  green "✓ Desktop alias created"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
green "════════════════════════════════════════════"
green " Installation complete!"
green ""
green " Double-click Meck-Grade in /Applications/"
green " or on your Desktop to start."
green ""
green " The app will open http://localhost:8374"
green " in your browser automatically."
green "════════════════════════════════════════════"
