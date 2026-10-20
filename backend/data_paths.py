"""Dados privados do aplicativo, fora da instalação e dos projetos originais."""

import os
import sys
from pathlib import Path


def data_directory():
    override = os.environ.get("JARVIS_DATA_DIR")
    if override and not Path(override).expanduser().is_absolute():
        raise ValueError("JARVIS_DATA_DIR deve ser um caminho absoluto.")
    if not override and getattr(sys, "frozen", False):
        raise ValueError("O backend portátil deve ser iniciado pelo aplicativo JARVIS.")
    return (
        Path(override).expanduser().resolve()
        if override
        else (
            Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local")))
            / "JARVIS"
        ).resolve()
    )
