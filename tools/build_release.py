"""Windows release pipeline; no personal configuration or databases are bundled."""

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def run(args, cwd=ROOT):
    subprocess.run(args, cwd=cwd, check=True)


def main():
    if sys.maxsize <= 2**32:
        raise RuntimeError("Use Python de 64 bits para compilar o JARVIS x64.")
    if os.name != "nt":
        raise RuntimeError("Compile o executável Windows em Windows x64.")
    if not importlib.util.find_spec("PyInstaller"):
        raise RuntimeError(
            "Instale uma vez: python -m pip install -r backend/requirements-build.txt"
        )
    npm = shutil.which("npm.cmd")
    if not npm or not (ROOT / "desktop/node_modules/electron-builder").is_dir():
        raise RuntimeError("Instale Node.js e execute npm ci em desktop uma vez.")
    package = json.loads((ROOT / "desktop/package.json").read_text(encoding="utf-8"))
    lock = json.loads((ROOT / "desktop/package-lock.json").read_text(encoding="utf-8"))
    if (
        package["version"] != lock["version"]
        or package["version"] != lock["packages"][""]["version"]
    ):
        raise RuntimeError("Versões de package.json e package-lock.json divergentes.")
    from build_icon import generate

    generate(ROOT / "build/icons")
    print("[JARVIS] Executando verificações antes da compilação...", flush=True)
    run(
        [
            sys.executable,
            "-m",
            "unittest",
            "-q",
            "test_start",
            "test_build",
            "test_setup",
        ]
    )
    run(
        [
            sys.executable,
            "-m",
            "unittest",
            "-q",
            "test_jarvis",
            "test_programming",
            "test_projects",
            "test_scope",
            "test_quick",
            "test_portable",
            "test_protection",
            "test_startup",
        ],
        ROOT / "backend",
    )
    run([npm, "test"], ROOT / "desktop")
    run([npm, "run", "test:electron"], ROOT / "desktop")
    run([npm, "run", "test:quick"], ROOT / "desktop")
    run(
        [
            sys.executable,
            "-m",
            "PyInstaller",
            "--noconfirm",
            "--onefile",
            "--windowed",
            "--name",
            "JARVIS Device Watcher",
            "--paths",
            str(ROOT / "backend"),
            "--distpath",
            str(ROOT / "build/startup"),
            "--workpath",
            str(ROOT / "build/startup-work"),
            "--specpath",
            str(ROOT / "build"),
            str(ROOT / "tools/startup_watcher.py"),
        ]
    )
    print(
        "[JARVIS] Compilando backend Python (sem .env ou dados pessoais)...", flush=True
    )
    run(
        [
            sys.executable,
            "-m",
            "PyInstaller",
            "--noconfirm",
            "--clean",
            "--onedir",
            "--console",
            "--name",
            "jarvis-backend",
            "--paths",
            str(ROOT / "backend"),
            "--distpath",
            str(ROOT / "build/backend"),
            "--workpath",
            str(ROOT / "build/pyinstaller"),
            "--specpath",
            str(ROOT / "build"),
            "--collect-submodules",
            "uvicorn",
            str(ROOT / "backend/packaged_entry.py"),
        ]
    )
    # Defense in depth: only compiled dependencies, never local config/memory.
    backend = ROOT / "build/backend/jarvis-backend"
    for file in backend.rglob("*"):
        if file.relative_to(backend).as_posix() == "_internal/certifi/cacert.pem":
            continue  # Public CA certificate bundle required for HTTPS, not a private key.
        if file.is_file() and (
            file.name.startswith(".env")
            or file.suffix.lower() in {".db", ".sqlite", ".sqlite3", ".pem", ".key"}
        ):
            raise RuntimeError(
                "Arquivo de configuração/dados inesperado no backend compilado."
            )
    print("[JARVIS] Gerando executável portátil...", flush=True)
    run([npm, "run", "package"], ROOT / "desktop")
    artifact = ROOT / "release" / f"JARVIS-{package['version']}-x64.exe"
    if not artifact.is_file():
        raise RuntimeError("O empacotador não produziu o executável esperado.")
    with artifact.open("rb") as stream:
        checksum = hashlib.file_digest(stream, "sha256").hexdigest()
    artifact.with_suffix(".exe.sha256").write_text(
        f"{checksum}  {artifact.name}\n", encoding="utf-8"
    )
    print(f"[JARVIS] Concluído: {artifact}\n[JARVIS] SHA-256: {checksum}", flush=True)
    if package["version"] in {"2.0.1", "2.0.1-dev.0"}:
        from build_setup import build_setup

        build_setup()


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, subprocess.CalledProcessError) as error:
        print(f"[JARVIS] Falha na compilação: {error}", file=sys.stderr)
        sys.exit(1)
