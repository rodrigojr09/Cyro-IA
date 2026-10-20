"""Portable paths never fall back to a host profile when the USB is missing."""

import os
from pathlib import Path


def portable_root(executable):
    """The installed layout is JARVIS/app/JARVIS.exe, data is its sibling."""
    executable = Path(executable).absolute()
    if executable.parent.name.lower() == "app":
        return executable.parent.parent
    return executable.parent / "JARVIS"


def safe_directory(path):
    path = Path(path).absolute()
    for item in (path, *path.parents):
        if item.exists() and (item.is_symlink() or item.resolve() != item):
            raise ValueError("Diretório portátil redirecionado.")
    path.mkdir(parents=True, exist_ok=True)
    return path


def source_reference(path, data_root):
    """Only sources on the same portable volume can follow drive-letter changes."""
    original = Path(path).resolve()
    volume = Path(data_root).resolve().anchor
    if os.name == "nt" and original.anchor.casefold() == volume.casefold():
        return "volume:" + original.relative_to(volume).as_posix()
    return str(original)


def resolve_source(reference, data_root):
    if not reference.startswith("volume:"):
        return reference
    from pathlib import PurePosixPath

    relative = PurePosixPath(reference[len("volume:") :])
    if relative.is_absolute() or ".." in relative.parts or ":" in str(relative):
        raise ValueError("Referência portátil inválida.")
    return str(Path(Path(data_root).resolve().anchor).joinpath(*relative.parts))
