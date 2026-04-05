"""
Plattformgerechte Pfade für schreibbare App-Daten.

Im Dev-Modus (direkt aus dem Repo):
  data/     → <repo>/data/
  uploads/  → <repo>/uploads/

Im PyInstaller-Bundle (sys.frozen == True):
  macOS  → ~/Library/Application Support/Meck-Grade/
  Windows→ %APPDATA%\\Meck-Grade\\
  Linux  → ~/.local/share/Meck-Grade/

So bleibt das Bundle-Verzeichnis selbst read-only, während die Nutzerdaten
in einen schreibbaren OS-spezifischen Ordner ausgelagert werden.
"""
import os
import sys


def _is_bundled() -> bool:
    return getattr(sys, "frozen", False)


def _user_data_root() -> str:
    """Gibt den OS-spezifischen, schreibbaren App-Daten-Ordner zurück."""
    if not _is_bundled():
        # Im Dev-Modus: klassisches <repo-root>/data/
        return os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "data",
        )
    if sys.platform == "darwin":
        return os.path.expanduser("~/Library/Application Support/Meck-Grade")
    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA") or os.path.expanduser("~")
        return os.path.join(appdata, "Meck-Grade")
    # Linux / sonstige
    return os.path.expanduser("~/.local/share/Meck-Grade")


def get_data_dir() -> str:
    """Persistenter Ordner für SQLite-DB und sonstige App-Daten."""
    d = _user_data_root()
    os.makedirs(d, exist_ok=True)
    return d


def get_uploads_dir() -> str:
    """Ordner für hochgeladene Scan-Bilder."""
    if not _is_bundled():
        # Im Dev-Modus: <repo-root>/uploads/  (wie bisher)
        d = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "uploads",
        )
    else:
        d = os.path.join(_user_data_root(), "uploads")
    os.makedirs(d, exist_ok=True)
    return d
