@echo off
setlocal
cd /d "%~dp0"
if exist "%~dp0backend\.venv\Scripts\python.exe" (
    "%~dp0backend\.venv\Scripts\python.exe" "%~dp0start.py"
) else (
    python "%~dp0start.py"
)
if errorlevel 1 (
    echo.
    echo O JARVIS nao iniciou. Confira a mensagem acima e o README.
    pause
)
endlocal
