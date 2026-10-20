"""Build setup only for the intended release, embedding public runtime files only."""

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def build_setup():
    version = json.loads((ROOT / "desktop/package.json").read_text())["version"]
    if version not in {"2.0.1", "2.0.1-dev.0"}:
        raise RuntimeError(
            "O Setup v2.0.1 só pode ser distribuído após sincronizar a versão e concluir os critérios da fase 2."
        )
    if os.name != "nt":
        raise RuntimeError("Compile o Setup em Windows x64.")
    payload = ROOT / "release" / f"JARVIS-{version}-x64.exe"
    if not payload.is_file():
        raise RuntimeError("Compile primeiro o aplicativo portátil.")
    output = ROOT / "build/setup"
    output.mkdir(parents=True, exist_ok=True)

    def freeze(name, entry, extra=()):
        subprocess.run(
            [
                sys.executable,
                "-m",
                "PyInstaller",
                "--noconfirm",
                "--clean",
                "--onefile",
                "--windowed",
                "--name",
                name,
                "--paths",
                str(ROOT / "backend"),
                "--distpath",
                str(output),
                "--workpath",
                str(ROOT / "build/setup-work"),
                "--specpath",
                str(ROOT / "build"),
                *extra,
                str(ROOT / entry),
            ],
            cwd=ROOT,
            check=True,
        )

    freeze("launcher", "tools/portable_launcher.py")
    # Setup expects a fixed payload name; bundle names must not depend on a drive letter.
    # Use a fixed payload basename in a public build directory.
    import shutil

    public_payload = output / "payload.exe"
    shutil.copyfile(payload, public_payload)
    freeze(
        "JARVIS Setup",
        "tools/setup_portable.py",
        [
            "--add-data",
            f"{public_payload};.",
            "--add-data",
            f"{output / 'launcher.exe'};.",
        ],
    )
    destination = (
        ROOT
        / "release"
        / (f"JARVIS Setup-{version}.exe" if "-dev." in version else "JARVIS Setup.exe")
    )
    shutil.copyfile(output / "JARVIS Setup.exe", destination)
    with destination.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    destination.with_suffix(".exe.sha256").write_text(f"{digest}  {destination.name}\n")
    return destination


if __name__ == "__main__":
    build_setup()
