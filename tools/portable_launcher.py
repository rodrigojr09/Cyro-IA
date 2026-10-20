"""Small frozen launcher; no absolute development paths or shell commands."""

import ctypes
from pathlib import Path
import subprocess
import sys


def main():
    root = Path(sys.executable).resolve().parent / "JARVIS"
    if (root / ".install-transaction.json").exists():
        raise RuntimeError("Instalação interrompida. Execute JARVIS Setup novamente.")
    if not (root / "VERSION").is_file():
        raise RuntimeError("Instalação incompleta. Execute JARVIS Setup.")
    executable = root / "app/JARVIS.exe"
    if not executable.is_file() or executable.is_symlink():
        raise RuntimeError("Aplicativo não encontrado no dispositivo.")
    subprocess.Popen([str(executable)], cwd=root, shell=False)


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError) as error:
        ctypes.windll.user32.MessageBoxW(None, str(error), "Iniciar JARVIS", 0x10)
