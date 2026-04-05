#!/usr/bin/env python3
"""
Meck-Grade Desktop Launcher (v1.4)
===================================
Startet den FastAPI/uvicorn-Server im Hintergrund-Thread und öffnet
ein natives Desktop-Fenster via pywebview — kein Browser wird geöffnet.

  macOS  → WKWebView (systemseitig, kein Chromium)
  Windows→ WebView2  (seit Win10 1803 vorinstalliert)

Verwendung:
  python desktop.py            # Dev-Modus aus dem Repo
  ./dist/Meck-Grade.app        # PyInstaller-Bundle (macOS)
  dist\\Meck-Grade\\Meck-Grade.exe  # PyInstaller-Bundle (Windows)
"""
import os
import sys
import threading
import time

PORT = 8374
HOST = "127.0.0.1"
URL  = f"http://{HOST}:{PORT}"


# ── Pfad-Auflösung ─────────────────────────────────────────────────────────────

def _resource_root() -> str:
    """
    Im PyInstaller-Bundle liegt der entpackte Code in sys._MEIPASS.
    Im Dev-Modus ist es das Verzeichnis dieser Datei.
    """
    if getattr(sys, "frozen", False):
        return sys._MEIPASS  # type: ignore[attr-defined]
    return os.path.dirname(os.path.abspath(__file__))


# ── Server ─────────────────────────────────────────────────────────────────────

def _start_server(root: str) -> None:
    """Startet uvicorn blockierend (läuft im Daemon-Thread)."""
    # Damit relative Imports im Backend funktionieren
    if root not in sys.path:
        sys.path.insert(0, root)
    os.chdir(root)

    import uvicorn  # noqa: PLC0415

    config = uvicorn.Config(
        "backend.main:app",
        host=HOST,
        port=PORT,
        log_level="warning",
        loop="asyncio",
        # Ein Worker — Desktop-App ist single-user
        workers=1,
    )
    server = uvicorn.Server(config)
    server.run()


def _wait_for_server(timeout: int = 25) -> bool:
    """Wartet bis der Health-Endpoint antwortet oder Timeout abläuft."""
    import urllib.request
    import urllib.error

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"{URL}/api/health", timeout=1):
                return True
        except Exception:
            time.sleep(0.15)
    return False


# ── Hauptfenster ───────────────────────────────────────────────────────────────

def main() -> None:
    import webview  # noqa: PLC0415

    root = _resource_root()

    # Server im Hintergrund starten
    server_thread = threading.Thread(
        target=_start_server, args=(root,), daemon=True, name="meckgrade-server"
    )
    server_thread.start()

    # Ladebildschirm während der Server hochfährt
    splash_html = """
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body {
        display:flex; flex-direction:column;
        align-items:center; justify-content:center;
        height:100vh;
        background:#0f172a; color:#e2e8f0;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      }
      h1 { font-size:1.8rem; font-weight:700; letter-spacing:.02em; margin-bottom:.5rem; }
      p  { font-size:.9rem; color:#94a3b8; }
      .dot { animation:pulse 1.4s ease-in-out infinite; }
      .dot:nth-child(2) { animation-delay:.2s; }
      .dot:nth-child(3) { animation-delay:.4s; }
      @keyframes pulse { 0%,80%,100%{opacity:.2} 40%{opacity:1} }
    </style>
    </head>
    <body>
      <h1>Meck-Grade</h1>
      <p>Wird gestartet<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></p>
    </body>
    </html>
    """

    window = webview.create_window(
        title="Meck-Grade",
        html=splash_html,
        width=1280,
        height=900,
        min_size=(900, 650),
        text_select=False,
        background_color="#0f172a",
    )

    def _on_ready():
        """Callback läuft im pywebview-Thread sobald das Fenster initialisiert ist."""
        if _wait_for_server():
            window.load_url(URL)
        else:
            window.load_html("""
            <body style='font-family:sans-serif;background:#0f172a;color:#e2e8f0;
                         display:flex;align-items:center;justify-content:center;height:100vh;'>
              <div style='text-align:center'>
                <h2>⚠ Server konnte nicht gestartet werden</h2>
                <p style='margin-top:1rem;color:#94a3b8'>
                  Bitte Meck-Grade neu starten.<br>
                  Falls das Problem anhält, prüfe ob Port 8374 bereits belegt ist.
                </p>
              </div>
            </body>
            """)

    webview.start(_on_ready, debug=False)


if __name__ == "__main__":
    main()
