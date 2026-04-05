#!/usr/bin/env python3
"""
Meck-Grade launcher.
Run this script to install dependencies, start the server, and open the browser.
"""
import subprocess
import sys
import webbrowser
import time
import os

PORT = 8374  # "MECK" on a phone keypad

ROOT = os.path.dirname(os.path.abspath(__file__))


def main():
    print("Meck-Grade — TCG Card Pre-Grading Tool")
    print("=" * 40)

    # Install / verify dependencies
    print("Checking dependencies...")
    req_file = os.path.join(ROOT, "requirements.txt")
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "-r", req_file, "-q"],
        cwd=ROOT,
    )
    print("Dependencies OK.")

    # Start uvicorn
    print(f"Starting server on http://127.0.0.1:{PORT} ...")
    server = subprocess.Popen(
        [
            sys.executable, "-m", "uvicorn",
            "backend.main:app",
            "--port", str(PORT),
            "--host", "127.0.0.1",
            "--log-level", "warning",
        ],
        cwd=ROOT,
    )

    # Brief pause then open browser
    time.sleep(2)
    url = f"http://127.0.0.1:{PORT}"
    print(f"Opening {url}")
    webbrowser.open(url)

    print("Press Ctrl+C to stop.")
    try:
        server.wait()
    except KeyboardInterrupt:
        print("\nShutting down...")
        server.terminate()
        server.wait()
        print("Done.")


if __name__ == "__main__":
    main()
