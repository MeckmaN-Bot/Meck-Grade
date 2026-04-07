@echo off
rem Meck-Grade — Windows Installer (Doppelklick)
rem Startet den grafischen Installer ohne CMD-Fenster.
setlocal

set REPO=%~dp0
cd /d "%REPO%"

rem pythonw startet Python ohne Konsolenfenster
where pythonw >nul 2>&1
if %errorlevel% equ 0 (
    start "" pythonw "%REPO%installer_gui.py"
    exit /b 0
)

rem Fallback: python (zeigt kurz CMD, schliesst sich dann)
where python >nul 2>&1
if %errorlevel% equ 0 (
    start "" python "%REPO%installer_gui.py"
    exit /b 0
)

rem Python nicht gefunden
powershell -NoProfile -Command "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('Python 3.9+ wird benoetigt.`nBitte von https://www.python.org/downloads/ installieren.', 'Meck-Grade Installer', 'OK', 'Error')" >nul 2>&1
