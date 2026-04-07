#!/usr/bin/env python3
"""
Meck-Grade — Grafischer Installer
Installiert alle Abhängigkeiten und startet die App.
Benötigt nur Python-Stdlib (tkinter, subprocess, threading, sys, os).
"""
import os
import subprocess
import sys
import threading
import tkinter as tk
from tkinter import ttk

# ── Farben & Fonts ────────────────────────────────────────────────────────────
BG          = "#0f0f1a"
BG_CARD     = "#1a1a2e"
ACCENT      = "#6c63ff"
ACCENT_DIM  = "#4a4380"
TEXT        = "#e0e0ff"
TEXT_DIM    = "#8888aa"
GREEN       = "#4ade80"
YELLOW      = "#fbbf24"
RED         = "#f87171"
MONO        = ("Courier New", 9) if sys.platform == "win32" else ("Menlo", 10)
ROOT_DIR    = os.path.dirname(os.path.abspath(__file__))


class InstallerApp:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Meck-Grade Installer")
        self.root.configure(bg=BG)
        self.root.resizable(False, False)
        self._center(520, 500)

        self._build_ui()
        self._check_python()

    # ── Layout ────────────────────────────────────────────────────────────────

    def _build_ui(self):
        # Header
        hdr = tk.Frame(self.root, bg=BG, pady=20)
        hdr.pack(fill="x")
        tk.Label(hdr, text="🃏  Meck-Grade", font=("Helvetica", 22, "bold"),
                 bg=BG, fg=TEXT).pack()
        tk.Label(hdr, text="TCG Karten-Grading Tool",
                 font=("Helvetica", 11), bg=BG, fg=TEXT_DIM).pack()

        # Separator
        tk.Frame(self.root, bg=ACCENT_DIM, height=1).pack(fill="x", padx=30)

        # Info card
        card = tk.Frame(self.root, bg=BG_CARD, padx=20, pady=14)
        card.pack(fill="x", padx=30, pady=(16, 0))

        # Python version row
        py_row = tk.Frame(card, bg=BG_CARD)
        py_row.pack(fill="x")
        self.lbl_py_icon = tk.Label(py_row, text="○", font=("Helvetica", 13),
                                    bg=BG_CARD, fg=TEXT_DIM, width=2)
        self.lbl_py_icon.pack(side="left")
        self.lbl_py = tk.Label(py_row, text="Python wird geprüft…",
                               font=("Helvetica", 11), bg=BG_CARD, fg=TEXT_DIM)
        self.lbl_py.pack(side="left")

        # Status row
        st_row = tk.Frame(card, bg=BG_CARD)
        st_row.pack(fill="x", pady=(6, 0))
        tk.Label(st_row, text="  ", bg=BG_CARD, width=2).pack(side="left")
        self.lbl_status = tk.Label(st_row, text="Bereit zur Installation.",
                                   font=("Helvetica", 10), bg=BG_CARD, fg=TEXT_DIM)
        self.lbl_status.pack(side="left")

        # Progress bar
        pb_frame = tk.Frame(self.root, bg=BG, pady=10)
        pb_frame.pack(fill="x", padx=30)
        style = ttk.Style()
        style.theme_use("default")
        style.configure("Accent.Horizontal.TProgressbar",
                        troughcolor=BG_CARD, background=ACCENT,
                        bordercolor=BG, lightcolor=ACCENT, darkcolor=ACCENT)
        self.progress = ttk.Progressbar(pb_frame, style="Accent.Horizontal.TProgressbar",
                                        mode="determinate", length=460, maximum=100)
        self.progress.pack()
        self.lbl_pct = tk.Label(pb_frame, text="", font=("Helvetica", 9),
                                bg=BG, fg=TEXT_DIM)
        self.lbl_pct.pack()

        # Log area
        log_frame = tk.Frame(self.root, bg=BG, padx=30)
        log_frame.pack(fill="both", expand=True, pady=(0, 10))
        self.log = tk.Text(log_frame, height=10, bg=BG_CARD, fg=TEXT_DIM,
                           font=MONO, relief="flat", state="disabled",
                           wrap="word", insertbackground=TEXT)
        scroll = tk.Scrollbar(log_frame, command=self.log.yview, bg=BG_CARD)
        self.log.configure(yscrollcommand=scroll.set)
        self.log.pack(side="left", fill="both", expand=True)
        scroll.pack(side="right", fill="y")

        # Button
        btn_frame = tk.Frame(self.root, bg=BG, pady=14)
        btn_frame.pack()
        self.btn = tk.Button(btn_frame, text="  Installieren  ",
                             font=("Helvetica", 13, "bold"),
                             bg=ACCENT, fg="white", activebackground=ACCENT_DIM,
                             activeforeground="white", relief="flat",
                             padx=20, pady=8, cursor="hand2",
                             command=self._on_install)
        self.btn.pack()

    # ── Python-Check ──────────────────────────────────────────────────────────

    def _check_python(self):
        vi = sys.version_info
        ver_str = f"Python {vi.major}.{vi.minor}.{vi.micro}"
        if vi < (3, 9):
            self.lbl_py_icon.config(text="✗", fg=RED)
            self.lbl_py.config(text=f"{ver_str} — zu alt (mind. 3.9 nötig)", fg=RED)
            self.btn.config(state="disabled", bg=ACCENT_DIM)
        elif vi >= (3, 14):
            self.lbl_py_icon.config(text="!", fg=YELLOW)
            self.lbl_py.config(
                text=f"{ver_str} — empfohlen: 3.12 (experimentell)",
                fg=YELLOW)
        else:
            self.lbl_py_icon.config(text="✓", fg=GREEN)
            self.lbl_py.config(text=f"{ver_str} — OK", fg=GREEN)

    # ── Install ───────────────────────────────────────────────────────────────

    def _on_install(self):
        self.btn.config(state="disabled", text="  Installiere…  ", bg=ACCENT_DIM)
        self.lbl_status.config(text="Pakete werden installiert…", fg=TEXT_DIM)
        self.progress["value"] = 0
        threading.Thread(target=self._run_install, daemon=True).start()

    def _run_install(self):
        req = os.path.join(ROOT_DIR, "requirements.txt")
        cmd = [sys.executable, "-m", "pip", "install", "-r", req,
               "--progress-bar", "off"]
        try:
            proc = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, cwd=ROOT_DIR,
            )
            lines_seen = 0
            # Heuristic: ~30 packages → increment ~3% per line
            for line in proc.stdout:
                line = line.rstrip()
                if not line:
                    continue
                self._log(line)
                lines_seen += 1
                pct = min(lines_seen * 3, 90)
                self.root.after(0, self._set_progress, pct)

            proc.wait()
            if proc.returncode == 0:
                self.root.after(0, self._install_success)
            else:
                self.root.after(0, self._install_error,
                                "pip hat einen Fehler zurückgegeben (siehe Log).")
        except Exception as exc:
            self.root.after(0, self._install_error, str(exc))

    def _install_success(self):
        self._set_progress(100)
        self.lbl_pct.config(text="Installation abgeschlossen!", fg=GREEN)
        self.lbl_status.config(text="Alle Pakete erfolgreich installiert.", fg=GREEN)
        self._log("\n✓  Fertig! Klicke auf 'Meck-Grade starten'.")
        self.btn.config(state="normal", text="  Meck-Grade starten  ",
                        bg=GREEN, fg="#0f0f1a",
                        command=self._launch_app)

    def _install_error(self, msg: str):
        self._set_progress(0)
        self.lbl_status.config(text=f"Fehler: {msg}", fg=RED)
        self._log(f"\n✗  Fehler: {msg}")
        self.btn.config(state="normal", text="  Erneut versuchen  ",
                        bg=RED, fg="white", command=self._on_install)

    # ── Launch ────────────────────────────────────────────────────────────────

    def _launch_app(self):
        run_script = os.path.join(ROOT_DIR, "run.py")
        subprocess.Popen([sys.executable, run_script], cwd=ROOT_DIR)
        self.root.after(800, self.root.destroy)

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _log(self, text: str):
        def _append():
            self.log.config(state="normal")
            self.log.insert("end", text + "\n")
            self.log.see("end")
            self.log.config(state="disabled")
        self.root.after(0, _append)

    def _set_progress(self, value: int):
        self.progress["value"] = value
        self.lbl_pct.config(
            text=f"{value}%" if 0 < value < 100 else ("" if value == 0 else ""))

    def _center(self, w: int, h: int):
        self.root.update_idletasks()
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        x = (sw - w) // 2
        y = (sh - h) // 2
        self.root.geometry(f"{w}x{h}+{x}+{y}")

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    InstallerApp().run()
