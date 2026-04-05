# -*- mode: python ; coding: utf-8 -*-
# PyInstaller Spec — Meck-Grade Desktop App
#
# Build:
#   macOS:   bash build-macos.sh
#   Windows: build-windows.bat
#
# Output:
#   macOS  → dist/Meck-Grade.app
#   Windows→ dist/Meck-Grade/Meck-Grade.exe

import sys
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

# ── Data files (nicht-Python-Ressourcen) ────────────────────────────────────
datas = [
    # Frontend-Dateien (HTML/CSS/JS) ins Bundle
    ("frontend", "frontend"),
]

# pywebview braucht seine eigenen HTML/JS-Assets
try:
    datas += collect_data_files("webview")
except Exception:
    pass

# OpenCV Cascade-XMLs etc.
try:
    datas += collect_data_files("cv2")
except Exception:
    pass

# Icon-Asset (optional — wird von BUNDLE/EXE referenziert)
import os
if os.path.exists("assets/icon.icns"):
    datas += [("assets/icon.icns", "assets")]
if os.path.exists("assets/icon.ico"):
    datas += [("assets/icon.ico", "assets")]

# ── Hidden imports ───────────────────────────────────────────────────────────
# PyInstaller erkennt dynamische Imports nicht automatisch.
hiddenimports = []

for pkg in ("backend", "uvicorn", "fastapi", "anyio", "starlette"):
    try:
        hiddenimports += collect_submodules(pkg)
    except Exception:
        pass

hiddenimports += [
    # Scientific stack
    "cv2", "PIL", "PIL.Image", "PIL.ImageOps",
    "numpy", "scipy", "scipy.ndimage", "skimage", "skimage.metrics",
    # FastAPI extras
    "aiofiles", "multipart", "email_validator",
    # Networking
    "requests", "urllib3", "certifi", "charset_normalizer",
    # PDF
    "reportlab", "reportlab.pdfgen", "reportlab.platypus",
    # pywebview backends
    "webview", "webview.platforms",
]

# ── Analysis ─────────────────────────────────────────────────────────────────
a = Analysis(
    ["desktop.py"],
    pathex=["."],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=["hooks"],   # hooks/ Ordner für eigene Hooks (kann leer sein)
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "IPython", "notebook"],
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

# ── Platform-spezifische Ausgabe ─────────────────────────────────────────────
if sys.platform == "darwin":
    # macOS: Folder-Bundle → .app
    exe = EXE(
        pyz, a.scripts, [],
        exclude_binaries=True,
        name="Meck-Grade",
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=False,
        console=False,           # kein Terminal-Fenster
        codesign_identity=None,  # für Gatekeeper-Signing hier Developer-ID eintragen
        entitlements_file=None,
    )
    coll = COLLECT(
        exe, a.binaries, a.zipfiles, a.datas,
        strip=False,
        upx=False,
        upx_exclude=[],
        name="Meck-Grade",
    )
    app = BUNDLE(
        coll,
        name="Meck-Grade.app",
        icon="assets/icon.icns" if os.path.exists("assets/icon.icns") else None,
        bundle_identifier="de.meckman.meck-grade",
        info_plist={
            "CFBundleName":              "Meck-Grade",
            "CFBundleDisplayName":       "Meck-Grade",
            "CFBundleShortVersionString": "1.4.0",
            "CFBundleVersion":           "1.4.0",
            "NSHighResolutionCapable":   True,
            "LSUIElement":               False,  # Dock-Eintrag anzeigen
            "NSRequiresAquaSystemAppearance": False,  # Dark Mode unterstützen
        },
    )

else:
    # Windows: einzelnes .exe (onefile) oder Ordner-Bundle
    exe = EXE(
        pyz,
        a.scripts,
        a.binaries,
        a.zipfiles,
        a.datas,
        name="Meck-Grade",
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=True,
        upx_exclude=[],
        runtime_tmpdir=None,
        console=False,           # kein CMD-Fenster
        disable_windowed_traceback=False,
        target_arch=None,
        codesign_identity=None,
        entitlements_file=None,
        icon="assets/icon.ico" if os.path.exists("assets/icon.ico") else None,
        version="version_info.txt" if os.path.exists("version_info.txt") else None,
    )
