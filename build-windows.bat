@echo off
rem ═══════════════════════════════════════════════════════════════════════════
rem Meck-Grade — Windows Desktop-App Build
rem Erstellt dist\Meck-Grade\Meck-Grade.exe via PyInstaller.
rem
rem Voraussetzungen:
rem   - Python 3.9+
rem   - venv installiert (install-windows.bat bereits ausgeführt)
rem
rem Verwendung:
rem   Doppelklick auf build-windows.bat
rem ═══════════════════════════════════════════════════════════════════════════
setlocal EnableDelayedExpansion
title Meck-Grade Build

set REPO=%~dp0
cd /d "%REPO%"

echo.
echo =========================================
echo  Meck-Grade Windows Desktop Build
echo =========================================
echo.

rem Venv aktivieren
if exist ".venv\Scripts\activate.bat" (
    call ".venv\Scripts\activate.bat"
    echo [OK] venv aktiviert
) else (
    echo [WARN] Kein .venv gefunden - verwende System-Python
)

rem Desktop-Abhaengigkeiten installieren
echo.
echo Installiere Desktop-Abhaengigkeiten...
pip install -r requirements-desktop.txt -q
if errorlevel 1 (
    echo [ERROR] pip install fehlgeschlagen.
    pause
    exit /b 1
)
echo [OK] Abhaengigkeiten installiert

rem Hooks-Verzeichnis erstellen
if not exist "hooks\" mkdir hooks

rem Alten Build aufraeumen
if exist "dist\Meck-Grade" rmdir /s /q "dist\Meck-Grade"
if exist "build\Meck-Grade" rmdir /s /q "build\Meck-Grade"

rem Build starten
echo.
echo Starte PyInstaller Build...
pyinstaller MeckGrade.spec --noconfirm --clean
if errorlevel 1 (
    echo [ERROR] PyInstaller Build fehlgeschlagen.
    pause
    exit /b 1
)

if exist "dist\Meck-Grade\Meck-Grade.exe" (
    echo.
    echo =========================================
    echo  Build erfolgreich!
    echo.
    echo  Ausfuehrbare Datei:
    echo  dist\Meck-Grade\Meck-Grade.exe
    echo.
    echo  Zum Testen: Doppelklick auf die .exe
    echo =========================================
) else (
    echo [ERROR] Meck-Grade.exe wurde nicht gefunden.
    pause
    exit /b 1
)

pause
