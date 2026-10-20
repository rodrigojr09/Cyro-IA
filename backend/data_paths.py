"""Dados privados do aplicativo, fora da instalação e dos projetos originais."""

import os
from pathlib import Path


def data_directory():
    override = os.environ.get("JARVIS_DATA_DIR")
    if override and not Path(override).expanduser().is_absolute():
        raise ValueError("JARVIS_DATA_DIR deve ser um caminho absoluto.")
    return (
        Path(override).expanduser().resolve()
        if override
        else (
            Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local")))
            / "JARVIS"
        ).resolve()
    )
