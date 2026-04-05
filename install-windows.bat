@echo off
setlocal EnableDelayedExpansion
title Meck-Grade Windows Installer

echo =========================================
echo  Meck-Grade Windows Installer
echo =========================================
echo.

:: ── 1. Find Python ────────────────────────────────────────────────────────────
set PYTHON=
for %%P in (python python3 py) do (
    %%P --version >nul 2>&1
    if !errorlevel! equ 0 (
        set PYTHON=%%P
        goto :found_python
    )
)

echo [ERROR] Python not found in PATH.
echo Please install Python 3.9+ from https://www.python.org/downloads/
echo Make sure to tick "Add Python to PATH" during installation.
pause
exit /b 1

:found_python
for /f "tokens=*" %%V in ('!PYTHON! --version 2^>^&1') do set PY_VER=%%V
echo [OK] !PY_VER!

:: ── 2. Create virtual environment ─────────────────────────────────────────────
set REPO_DIR=%~dp0
set VENV_DIR=%REPO_DIR%.venv

echo.
echo Creating virtual environment...
!PYTHON! -m venv "%VENV_DIR%"
if errorlevel 1 (
    echo [ERROR] Failed to create virtual environment.
    pause
    exit /b 1
)
echo [OK] Virtual environment created at .venv\

:: ── 3. Install dependencies ───────────────────────────────────────────────────
echo.
echo Installing Python packages (this may take a few minutes)...
"%VENV_DIR%\Scripts\pip.exe" install --upgrade pip --quiet
"%VENV_DIR%\Scripts\pip.exe" install -r "%REPO_DIR%requirements.txt" --quiet
if errorlevel 1 (
    echo [ERROR] Package installation failed. Check your internet connection.
    pause
    exit /b 1
)
echo [OK] Python packages installed

:: ── 4. Create data directories ────────────────────────────────────────────────
if not exist "%REPO_DIR%data\" mkdir "%REPO_DIR%data"
if not exist "%REPO_DIR%uploads\" mkdir "%REPO_DIR%uploads"
echo [OK] Data directories ready

:: ── 5. Create launcher batch file ────────────────────────────────────────────
set LAUNCHER=%REPO_DIR%Meck-Grade.bat
(
  echo @echo off
  echo title Meck-Grade
  echo cd /d "%REPO_DIR%"
  echo call ".venv\Scripts\activate.bat"
  echo python run.py
) > "%LAUNCHER%"
echo [OK] Launcher created: Meck-Grade.bat

:: ── 6. Create desktop shortcut via PowerShell ─────────────────────────────────
echo.
echo Creating Desktop shortcut...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; ^
   $s = $ws.CreateShortcut([System.IO.Path]::Combine($env:USERPROFILE, 'Desktop', 'Meck-Grade.lnk')); ^
   $s.TargetPath = '%LAUNCHER%'; ^
   $s.WorkingDirectory = '%REPO_DIR%'; ^
   $s.Description = 'Meck-Grade TCG Card Grader'; ^
   $s.Save()"
if errorlevel 1 (
    echo [WARN] Could not create desktop shortcut. Run Meck-Grade.bat manually.
) else (
    echo [OK] Desktop shortcut created
)

:: ── 7. Tesseract hint ─────────────────────────────────────────────────────────
echo.
echo =========================================
echo  NOTE: For card name OCR (optional),
echo  install Tesseract:
echo  https://github.com/UB-Mannheim/tesseract/wiki
echo  and add it to your PATH.
echo =========================================

:: ── Done ──────────────────────────────────────────────────────────────────────
echo.
echo =========================================
echo  Installation complete!
echo.
echo  Double-click "Meck-Grade" on your Desktop
echo  or run Meck-Grade.bat to start.
echo.
echo  The app opens http://localhost:8374
echo  in your browser automatically.
echo =========================================
echo.
pause
