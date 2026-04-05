@echo off
rem ═══════════════════════════════════════════════════════════════════════════
rem Meck-Grade — Windows Installer
rem
rem Was passiert:
rem  1. Python 3.9+ pruefen
rem  2. Python-venv erstellen
rem  3. Alle Abhaengigkeiten installieren (inkl. pywebview + pyinstaller)
rem  4. PyInstaller-Build -> dist\Meck-Grade\Meck-Grade.exe
rem  5. Desktop-Verknuepfung auf Meck-Grade.exe erstellen
rem
rem Ergebnis: eigenstaendige .exe ohne Browser und ohne CMD-Fenster.
rem
rem Verwendung:
rem   Doppelklick auf install-windows.bat
rem ═══════════════════════════════════════════════════════════════════════════
setlocal EnableDelayedExpansion
title Meck-Grade Installer

set REPO_DIR=%~dp0
cd /d "%REPO_DIR%"

echo.
echo =========================================
echo  Meck-Grade Windows Installer
echo =========================================
echo.

rem ── 1. Python pruefen ───────────────────────────────────────────────────────
set PYTHON=
for %%P in (python python3 py) do (
    %%P --version >nul 2>&1
    if !errorlevel! equ 0 (
        set PYTHON=%%P
        goto :found_python
    )
)
echo [FEHLER] Python nicht gefunden.
echo Bitte installiere Python 3.9+ von https://www.python.org/downloads/
echo Achte auf "Add Python to PATH" waehrend der Installation.
pause
exit /b 1

:found_python
for /f "tokens=*" %%V in ('!PYTHON! --version 2^>^&1') do set PY_VER=%%V
echo [OK] !PY_VER!

rem ── 2. Venv erstellen ───────────────────────────────────────────────────────
echo.
echo Erstelle Python-Umgebung...
!PYTHON! -m venv "%REPO_DIR%.venv"
if errorlevel 1 (
    echo [FEHLER] Venv-Erstellung fehlgeschlagen.
    pause
    exit /b 1
)
echo [OK] Virtuelle Umgebung: .venv\

rem ── 3. Abhaengigkeiten installieren ─────────────────────────────────────────
echo.
echo Installiere Abhaengigkeiten (kann einige Minuten dauern)...
"%REPO_DIR%.venv\Scripts\pip.exe" install --upgrade pip -q
"%REPO_DIR%.venv\Scripts\pip.exe" install -r "%REPO_DIR%requirements-desktop.txt" -q
if errorlevel 1 (
    echo [FEHLER] pip install fehlgeschlagen. Internetverbindung pruefen.
    pause
    exit /b 1
)
echo [OK] Alle Pakete installiert

rem ── 4. PyInstaller-Build ────────────────────────────────────────────────────
echo.
echo Baue Meck-Grade.exe (PyInstaller - das dauert etwas)...
if not exist "hooks\" mkdir hooks
if exist "dist\Meck-Grade" rmdir /s /q "dist\Meck-Grade"
if exist "build\Meck-Grade" rmdir /s /q "build\Meck-Grade"

"%REPO_DIR%.venv\Scripts\pyinstaller.exe" MeckGrade.spec --noconfirm --clean
if errorlevel 1 (
    echo [FEHLER] PyInstaller-Build fehlgeschlagen.
    pause
    exit /b 1
)

if not exist "%REPO_DIR%dist\Meck-Grade\Meck-Grade.exe" (
    echo [FEHLER] Meck-Grade.exe nicht gefunden nach Build.
    pause
    exit /b 1
)
echo [OK] dist\Meck-Grade\Meck-Grade.exe erstellt

rem ── 5. Desktop-Verknuepfung erstellen ───────────────────────────────────────
echo.
echo Erstelle Desktop-Verknuepfung...
set EXE_PATH=%REPO_DIR%dist\Meck-Grade\Meck-Grade.exe
set LNK_PATH=%USERPROFILE%\Desktop\Meck-Grade.lnk

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; ^
   $s = $ws.CreateShortcut('%LNK_PATH%'); ^
   $s.TargetPath = '%EXE_PATH%'; ^
   $s.WorkingDirectory = '%REPO_DIR%dist\Meck-Grade'; ^
   $s.Description = 'Meck-Grade TCG Karten-Grading'; ^
   $s.Save()"

if errorlevel 1 (
    echo [WARN] Desktop-Verknuepfung konnte nicht erstellt werden.
    echo Starte die App manuell: dist\Meck-Grade\Meck-Grade.exe
) else (
    echo [OK] Desktop-Verknuepfung erstellt
)

rem ── WebView2-Hinweis ─────────────────────────────────────────────────────────
echo.
echo =========================================
echo  Hinweis: WebView2
echo  Seit Windows 10 (Version 1803) ist
echo  WebView2 vorinstalliert.
echo  Falls nicht: pywebview zeigt einen
echo  Download-Link beim ersten Start.
echo =========================================

rem ── Fertig ───────────────────────────────────────────────────────────────────
echo.
echo =========================================
echo  Installation abgeschlossen!
echo.
echo  Doppelklick auf "Meck-Grade" auf dem
echo  Desktop — kein Browser oeffnet sich.
echo =========================================
echo.
pause
