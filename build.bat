@echo off
setlocal
cd /d "%~dp0"
if exist "backend\.venv\Scripts\python.exe" (
  "backend\.venv\Scripts\python.exe" tools\build_release.py
) else (
  python tools\build_release.py
)
if errorlevel 1 (
  echo.
  echo [JARVIS] Compilacao interrompida. Confira o erro acima.
  pause
  exit /b 1
)
echo.
echo [JARVIS] Executavel disponivel na pasta release.
pause
